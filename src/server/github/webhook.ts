import "server-only";

import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";
import { sql } from "drizzle-orm";

import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import {
  findProjectsByGithubFullName,
  getProjectById,
} from "@complyloop/db/repo/projects";

import { enqueueAssessmentJob } from "../assessment/assessment-jobs";
import { githubWebhookSecret } from "../env";
import { assertRateLimit } from "../rate-limit";

type PushPayload = EmitterWebhookEvent<"push">["payload"];
type PullRequestPayload = EmitterWebhookEvent<"pull_request">["payload"];

type WithInstallation = {
  installation?: {
    id: number;
  };
};

function installationIdFromPayload(
  payload: PushPayload | PullRequestPayload,
): number | undefined {
  const withInstallation = payload as WithInstallation;
  return typeof withInstallation.installation?.id === "number"
    ? withInstallation.installation.id
    : undefined;
}

const HANDLED_PR_ACTIONS = ["opened", "synchronize", "reopened"] as const;
type HandledPrAction = (typeof HANDLED_PR_ACTIONS)[number];

export function isWebhookConfigured(): boolean {
  return Boolean(process.env.GITHUB_WEBHOOK_SECRET);
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

function isHandledPrAction(action: string): action is HandledPrAction {
  return (HANDLED_PR_ACTIONS as readonly string[]).includes(action);
}

type HandledWebhookEvent =
  | { kind: "push"; payload: PushPayload }
  | {
      kind: "pull_request";
      payload: PullRequestPayload;
      action: HandledPrAction;
    };

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
  if (eventName === "pull_request") {
    const prPayload = payload as PullRequestPayload;
    if (
      typeof prPayload.action !== "string" ||
      !isHandledPrAction(prPayload.action)
    ) {
      return { ok: false, message: `Ignored event ${eventName}` };
    }
    return {
      ok: true,
      event: {
        kind: "pull_request",
        payload: prPayload,
        action: prPayload.action,
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

function checkoutRef(event: HandledWebhookEvent): string | undefined {
  if (event.kind === "push") {
    const after = event.payload.after;
    return typeof after === "string" && /^[0-9a-f]{40}$/i.test(after)
      ? after
      : undefined;
  }
  const sha = event.payload.pull_request?.head?.sha;
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha)
    ? sha
    : undefined;
}

/**
 * Only pushes to the project's default branch are authoritative for the
 * project's compliance state. Scans of feature branches must not resolve
 * findings or auto-verify remediations, so we do not enqueue them here.
 */
function isDefaultBranchPush(
  payload: PushPayload,
  defaultBranch: string | undefined,
): boolean {
  return (
    typeof payload.ref === "string" &&
    typeof defaultBranch === "string" &&
    payload.ref === `refs/heads/${defaultBranch}`
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

  if (
    parsed.event.kind === "push" &&
    !isDefaultBranchPush(parsed.event.payload, liveDefaultBranch)
  ) {
    // Feature-branch pushes are not authoritative; scanning them could resolve
    // findings / auto-verify remediations off the project's real state.
    return {
      handled: false,
      message: `Ignored push to a non-default branch for ${fullName}.`,
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
  const pullRequestHeadSha =
    parsed.event.kind === "pull_request" ? ref : undefined;
  const job = await enqueueAssessmentJob({
    projectId: project.id,
    trigger: "webhook",
    idempotencyKey: deliveryId,
    payload: {
      ref,
      eventName: parsed.event.kind,
      pullRequestHeadSha,
    },
  });
  return {
    handled: true,
    message: `Queued re-assessment of ${fullName}.`,
    jobId: job.id,
  };
}
