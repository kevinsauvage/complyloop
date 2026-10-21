import "server-only";

import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";
import { sql } from "drizzle-orm";

import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import {
  findProjectsByGithubFullName,
  getProjectById,
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
  // Atomic compare-and-set: concurrent deliveries race here, so the check and
  // the write must happen in one UPDATE. IS DISTINCT FROM also covers a NULL
  // stored branch. Checkout-ref validation stays at checkoutRef() (40-hex).
  await drizzle.execute(sql`
    UPDATE projects
    SET payload = jsonb_set(payload, '{github,defaultBranch}', to_jsonb(${liveBranch}::text), true)
    WHERE id = ${projectId}
      AND (payload->'github'->>'defaultBranch' IS DISTINCT FROM ${liveBranch})
  `);
  // Decide authority on the post-write row so concurrent renames converge
  // instead of each delivery acting on its own stale view.
  const fresh = await getProjectById(drizzle, projectId);
  return fresh?.github?.defaultBranch ?? liveBranch;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Records the newest tracked-branch deployment on the project so manual runs
 * can audit it. Compare-and-set on the SHA: the delivery that already passed
 * the "newest pushed commit" guard wins, and a redelivery is a no-op.
 */
async function rememberDeployment(
  drizzle: DrizzleDb,
  projectId: string,
  target: { url: string; sha: string },
): Promise<void> {
  await drizzle.execute(sql`
    UPDATE projects
    SET payload = jsonb_set(payload, '{lastDeployment}', ${JSON.stringify(target)}::jsonb, true)
    WHERE id = ${projectId}
      AND (payload->'lastDeployment'->>'sha') IS DISTINCT FROM ${target.sha}
  `);
}

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
  jobId?: string;
}

/**
 * Validated webhook delivery boundary. It never clones or scans in the request
 * path: it only resolves the project and creates an idempotent durable job.
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
  // Uniqueness is per-org: the same public repo may be connected in several
  // orgs. Resolve by installation id — never an arbitrary row. A delivery
  // that cannot be pinned to exactly one project is rejected instead of
  // scanning or mutating the wrong tenant.
  const candidates = await findProjectsByGithubFullName(drizzle, fullName);
  if (candidates.length === 0) {
    return { handled: false, message: `No connected project for ${fullName}` };
  }

  const payloadInstallationId = installationIdFromPayload(parsed.event.payload);
  let project: (typeof candidates)[number] | null = null;
  if (payloadInstallationId !== undefined) {
    // Pinned delivery: only the project bound to this installation may run.
    // An unbound row never matches, so a foreign installation cannot
    // commandeer another tenant's project through a shared repo name.
    project =
      candidates.find(
        (candidate) => candidate.installationId === payloadInstallationId,
      ) ?? null;
    if (!project) {
      return {
        handled: false,
        message: `Installation id mismatch for ${fullName}.`,
      };
    }
  } else if (candidates.length > 1) {
    return {
      handled: false,
      message: `Ambiguous project for ${fullName}: connected in ${candidates.length} organizations without a delivery installation id.`,
    };
  } else {
    // Exactly one candidate (empty was returned above). A bound project with
    // an installation-less delivery is the same mismatch as before; an
    // unbound single project keeps the legacy accept.
    project = candidates[0]!;
    if (project.installationId !== undefined) {
      return {
        handled: false,
        message: `Installation id mismatch for ${fullName}.`,
      };
    }
  }

  const payloadDefaultBranch = repositoryDefaultBranch(parsed.event);
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
    parsed.event.kind === "push" &&
    !isTrackedBranchPush(parsed.event.payload, trackedBranch)
  ) {
    // Other branches are not authoritative; scanning them could resolve
    // findings / auto-verify remediations off the project's real state.
    return {
      handled: false,
      message: `Ignored push to a branch other than the tracked branch (${trackedBranch ?? "unknown"}) for ${fullName}.`,
    };
  }

  await assertRateLimit(`webhook:${project.id}`, 60, 60_000);
  const ref = checkoutRef(parsed.event);
  if (!ref) {
    return {
      handled: false,
      message: `Ignored ${parsed.event.kind} without a valid checkout SHA for ${fullName}.`,
    };
  }

  let runtimeTarget: { url: string; sha: string } | undefined;
  if (parsed.event.kind === "deployment_status") {
    const origin = trackedBranchDeploymentOrigin(
      parsed.event.payload,
      trackedBranch,
    );
    if (!origin) {
      return {
        handled: false,
        message: `Ignored deployment status for ${fullName}: not a successful tracked-branch https deployment.`,
      };
    }
    // The push webhook always precedes its deployment, so the newest webhook
    // job names the newest commit. A deployment of any other commit was
    // replaced while it built; auditing it would re-derive state from stale
    // code.
    if ((await latestWebhookJobRef(project.id)) !== ref) {
      return {
        handled: false,
        message: `Ignored deployment of ${ref.slice(0, 7)} for ${fullName}: it is not the latest pushed commit.`,
      };
    }
    runtimeTarget = { url: origin, sha: ref };
    await rememberDeployment(drizzle, project.id, runtimeTarget);
  }

  const job = await enqueueAssessmentJob({
    projectId: project.id,
    trigger: "webhook",
    idempotencyKey: deliveryId,
    payload: {
      ref,
      eventName: parsed.event.kind,
      ...(runtimeTarget ? { runtimeTarget } : {}),
    },
  });
  return {
    handled: true,
    message: `Queued re-assessment of ${fullName}.`,
    jobId: job.id,
  };
}
