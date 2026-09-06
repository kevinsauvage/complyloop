import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";
import { enqueueAssessmentJob } from "./assessment-jobs";
import { getDrizzle } from "@complyloop/db/client";
import { findProjectByGithubFullName } from "@complyloop/db/postgres-queries";
import { assertRateLimit } from "./rate-limit";

type PushPayload = EmitterWebhookEvent<"push">["payload"];
type PullRequestPayload = EmitterWebhookEvent<"pull_request">["payload"];

const HANDLED_PR_ACTIONS = ["opened", "synchronize", "reopened"] as const;
type HandledPrAction = (typeof HANDLED_PR_ACTIONS)[number];

export function isWebhookConfigured(): boolean {
  return Boolean(process.env.GITHUB_WEBHOOK_SECRET);
}

export async function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
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
    return { ok: true, event: { kind: "push", payload: payload as PushPayload } };
  }
  if (eventName === "pull_request") {
    const prPayload = payload as PullRequestPayload;
    if (typeof prPayload.action !== "string" || !isHandledPrAction(prPayload.action)) {
      return { ok: false, message: `Ignored event ${eventName}` };
    }
    return {
      ok: true,
      event: { kind: "pull_request", payload: prPayload, action: prPayload.action },
    };
  }
  return { ok: false, message: `Ignored event ${eventName}` };
}

function repositoryFullName(event: HandledWebhookEvent): string | undefined {
  const fullName = event.payload.repository?.full_name;
  return typeof fullName === "string" && fullName.length > 0 ? fullName : undefined;
}

function checkoutRef(event: HandledWebhookEvent): string | undefined {
  if (event.kind === "push") {
    const after = event.payload.after;
    return typeof after === "string" && /^[0-9a-f]{40}$/i.test(after)
      ? after
      : undefined;
  }
  const sha = event.payload.pull_request?.head?.sha;
  return typeof sha === "string" && sha.length > 0 ? sha : undefined;
}

/**
 * Only pushes to the project's default branch are authoritative for the
 * project's compliance state. Scans of feature branches must not resolve
 * findings or auto-verify remediations, so we do not enqueue them here.
 */
function isDefaultBranchPush(
  payload: PushPayload,
  project: { defaultBranch?: string } | null,
): boolean {
  const branch = project?.defaultBranch;
  return typeof payload.ref === "string" && typeof branch === "string" &&
    payload.ref === `refs/heads/${branch}`;
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
  const project = await findProjectByGithubFullName(drizzle, fullName);
  if (!project) {
    return { handled: false, message: `No connected project for ${fullName}` };
  }

  if (
    parsed.event.kind === "push" &&
    !isDefaultBranchPush(parsed.event.payload, project)
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
