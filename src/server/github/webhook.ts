import "server-only";

import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";

import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import {
  findProjectsByGithubFullName,
  recordProjectDefaultBranch,
  recordProjectLastDeployment,
} from "@complyloop/db/repo/projects";

import {
  enqueueAssessmentJob,
  latestWebhookJobRef,
} from "../assessment/assessment-jobs";
import { githubWebhookSecret } from "../env";
import { assertRateLimit } from "../rate-limit";

type PushPayload = EmitterWebhookEvent<"push">["payload"];
type DeploymentStatusPayload =
  EmitterWebhookEvent<"deployment_status">["payload"];

type WithInstallation = {
  installation?: {
    id: number;
  };
};

function installationIdFromPayload(
  payload: PushPayload | DeploymentStatusPayload,
): number | undefined {
  const withInstallation = payload as WithInstallation;
  return typeof withInstallation.installation?.id === "number"
    ? withInstallation.installation.id
    : undefined;
}

export function isWebhookConfigured(): boolean {
  return Boolean(githubWebhookSecret());
}

export async function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = githubWebhookSecret();
  if (!secret || !signatureHeader) return false;
  try {
    return await verifyWebhookSignature(secret, rawBody, signatureHeader);
  } catch {
    return false;
  }
}

type HandledWebhookEvent =
  | { kind: "push"; payload: PushPayload }
  | { kind: "deployment_status"; payload: DeploymentStatusPayload };

function parseHandledWebhookEvent(
  eventName: string,
  payload: unknown,
): { ok: true; event: HandledWebhookEvent } | { ok: false; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, message: "Invalid payload" };
  }
  if (eventName === "push") {
    return {
      ok: true,
      event: { kind: "push", payload: payload as PushPayload },
    };
  }
  if (eventName === "deployment_status") {
    return {
      ok: true,
      event: {
        kind: "deployment_status",
        payload: payload as DeploymentStatusPayload,
      },
    };
  }
  return { ok: false, message: `Ignored event ${eventName}` };
}

function repositoryFullName(event: HandledWebhookEvent): string | undefined {
  const fullName = event.payload.repository?.full_name;
  return typeof fullName === "string" && fullName.length > 0
    ? fullName
    : undefined;
}

function repositoryDefaultBranch(
  event: HandledWebhookEvent,
): string | undefined {
  const branch = event.payload.repository?.default_branch;
  return typeof branch === "string" && branch.length > 0 ? branch : undefined;
}

async function persistDefaultBranchIfChanged(
  drizzle: DrizzleDb,
  projectId: string,
  liveBranch: string,
  storedBranch: string | undefined,
): Promise<string | undefined> {
  if (liveBranch === storedBranch) return storedBranch ?? liveBranch;
  // Decide authority on the post-write row so concurrent renames converge
  // instead of each delivery acting on its own stale view. Checkout-ref
  // validation stays at checkoutRef() (40-hex).
  return (
    (await recordProjectDefaultBranch(drizzle, projectId, liveBranch)) ??
    liveBranch
  );
}

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const ZERO_SHA = "0000000000000000000000000000000000000000";

function checkoutRef(event: HandledWebhookEvent): string | undefined {
  // A branch deletion arrives as a push with `deleted: true` and an all-zero
  // `after`: there is no commit to check out, and scanning the previous tree
  // would resolve findings for a ref that no longer exists.
  if (event.kind === "push" && event.payload.deleted === true) return undefined;
  const sha =
    event.kind === "push" ? event.payload.after : event.payload.deployment?.sha;
  if (typeof sha !== "string" || sha === ZERO_SHA) return undefined;
  return SHA_PATTERN.test(sha) ? sha : undefined;
}

/**
 * A successful deployment of the tracked branch, with the origin it is served
 * from. Hosts differ on the deployment `ref`: some send the branch name (or a
 * full ref), Vercel sends the commit SHA itself. A SHA ref proves nothing
 * about the branch, so the caller must still match the SHA against the newest
 * tracked-branch push (`latestWebhookJobRef`) — preview deployments of other
 * commits are not authoritative and are ignored there. The URL is
 * `environment_url` or, failing that, `target_url`.
 */
function trackedBranchDeploymentOrigin(
  payload: DeploymentStatusPayload,
  trackedBranch: string | undefined,
): string | undefined {
  if (payload.deployment_status?.state !== "success") return undefined;
  const ref = payload.deployment?.ref;
  const sha = payload.deployment?.sha;
  const onDefaultBranch =
    trackedBranch !== undefined &&
    (ref === trackedBranch || ref === `refs/heads/${trackedBranch}`);
  const refIsCommit =
    typeof ref === "string" &&
    typeof sha === "string" &&
    ref.toLowerCase() === sha.toLowerCase();
  if (!onDefaultBranch && !refIsCommit) return undefined;
  const raw =
    payload.deployment_status.environment_url ||
    payload.deployment_status.target_url;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // SSRF screening (private ranges, DNS) happens at scan time in
    // `scanRuntime`; here we only refuse anything that is not plain https.
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Only pushes to the project's tracked branch (its default branch unless one
 * is set) are authoritative for the project's compliance state. Scans of other
 * branches must not resolve findings or auto-verify remediations, so we do not
 * enqueue them here.
 */
function isTrackedBranchPush(
  payload: PushPayload,
  trackedBranch: string | undefined,
): boolean {
  return (
    typeof payload.ref === "string" &&
    typeof trackedBranch === "string" &&
    payload.ref === `refs/heads/${trackedBranch}`
  );
}

export interface WebhookHandleResult {
  handled: boolean;
  message: string;
  /** One job per project the delivery was routed to. */
  jobIds?: string[];
}

type WebhookProject = Awaited<
  ReturnType<typeof findProjectsByGithubFullName>
>[number];

/**
 * The projects a delivery is for. The same repo may be connected in several
 * orgs, and orgs of one GitHub account share its installation, so a pinned
 * delivery goes to every project bound to that installation — never to an
 * unbound or foreign-installation row. An installation-less delivery is only
 * accepted for a single unbound project.
 */
function deliveryProjects(
  candidates: readonly WebhookProject[],
  payloadInstallationId: number | undefined,
  fullName: string,
): { ok: true; projects: WebhookProject[] } | { ok: false; message: string } {
  if (payloadInstallationId !== undefined) {
    const pinned = candidates.filter(
      (candidate) => candidate.installationId === payloadInstallationId,
    );
    return pinned.length > 0
      ? { ok: true, projects: pinned }
      : { ok: false, message: `Installation id mismatch for ${fullName}.` };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      message: `Ambiguous project for ${fullName}: connected in ${candidates.length} organizations without a delivery installation id.`,
    };
  }
  const [only] = candidates;
  if (!only || only.installationId !== undefined) {
    return { ok: false, message: `Installation id mismatch for ${fullName}.` };
  }
  return { ok: true, projects: [only] };
}

async function handleProjectDelivery(
  drizzle: DrizzleDb,
  event: HandledWebhookEvent,
  project: WebhookProject,
  fullName: string,
  deliveryId: string | undefined,
): Promise<{ message: string; jobId?: string }> {
  const payloadDefaultBranch = repositoryDefaultBranch(event);
  let liveDefaultBranch = payloadDefaultBranch ?? project.defaultBranch;
  if (payloadDefaultBranch) {
    const freshBranch = await persistDefaultBranchIfChanged(
      drizzle,
      project.id,
      payloadDefaultBranch,
      project.defaultBranch,
    );
    if (freshBranch) liveDefaultBranch = freshBranch;
  }

  // The project's truth is its tracked branch when one is set (a `develop`
  // preview), otherwise the live default branch.
  const trackedBranch = project.trackedBranch ?? liveDefaultBranch;

  if (
    event.kind === "push" &&
    !isTrackedBranchPush(event.payload, trackedBranch)
  ) {
    // Other branches are not authoritative; scanning them could resolve
    // findings / auto-verify remediations off the project's real state.
    return {
      message: `Ignored push to a branch other than the tracked branch (${trackedBranch ?? "unknown"}) for ${fullName}.`,
    };
  }

  await assertRateLimit(`webhook:${project.id}`, 60, 60_000);
  const ref = checkoutRef(event);
  if (!ref) {
    return {
      message: `Ignored ${event.kind} without a valid checkout SHA for ${fullName}.`,
    };
  }

  let runtimeTarget: { url: string; sha: string } | undefined;
  if (event.kind === "deployment_status") {
    const origin = trackedBranchDeploymentOrigin(event.payload, trackedBranch);
    if (!origin) {
      return {
        message: `Ignored deployment status for ${fullName}: not a successful tracked-branch https deployment.`,
      };
    }
    // The push webhook always precedes its deployment, so the newest webhook
    // job names the newest commit. A deployment of any other commit was
    // replaced while it built; auditing it would re-derive state from stale
    // code.
    if ((await latestWebhookJobRef(project.id)) !== ref) {
      return {
        message: `Ignored deployment of ${ref.slice(0, 7)} for ${fullName}: it is not the latest pushed commit.`,
      };
    }
    runtimeTarget = { url: origin, sha: ref };
    await recordProjectLastDeployment(drizzle, project.id, runtimeTarget);
  }

  const job = await enqueueAssessmentJob({
    projectId: project.id,
    trigger: "webhook",
    // Per project: one delivery may fan out, and the key is globally unique.
    idempotencyKey: deliveryId ? `${deliveryId}:${project.id}` : undefined,
    payload: {
      ref,
      eventName: event.kind,
      ...(runtimeTarget ? { runtimeTarget } : {}),
    },
  });
  return { message: `Queued re-assessment of ${fullName}.`, jobId: job.id };
}

/**
 * Validated webhook delivery boundary. It never clones or scans in the request
 * path: it only resolves the projects and creates idempotent durable jobs.
 */
export async function handleGitHubWebhookEvent(
  eventName: string,
  payload: unknown,
  deliveryId?: string,
): Promise<WebhookHandleResult> {
  const parsed = parseHandledWebhookEvent(eventName, payload);
  if (!parsed.ok) return { handled: false, message: parsed.message };

  const fullName = repositoryFullName(parsed.event);
  if (!fullName) return { handled: false, message: "No repository in payload" };

  const drizzle = await getDrizzle();
  const candidates = await findProjectsByGithubFullName(drizzle, fullName);
  if (candidates.length === 0) {
    return { handled: false, message: `No connected project for ${fullName}` };
  }
  const routed = deliveryProjects(
    candidates,
    installationIdFromPayload(parsed.event.payload),
    fullName,
  );
  if (!routed.ok) return { handled: false, message: routed.message };

  const outcomes = [];
  for (const project of routed.projects) {
    outcomes.push(
      await handleProjectDelivery(
        drizzle,
        parsed.event,
        project,
        fullName,
        deliveryId,
      ),
    );
  }
  const jobIds = outcomes.flatMap((outcome) =>
    outcome.jobId ? [outcome.jobId] : [],
  );
  return {
    handled: jobIds.length > 0,
    message: [...new Set(outcomes.map((outcome) => outcome.message))].join(" "),
    ...(jobIds.length > 0 ? { jobIds } : {}),
  };
}
