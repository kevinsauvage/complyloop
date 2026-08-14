import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";
import type { Alert } from "@/core/finding-types";
import { runAssessment } from "./assessment";
import { addEvidence, loadDb, withDbWrite, type Db } from "./db";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import { resolveProjectGitHubToken } from "./github-access";
import { reportError, reportWarning } from "./observability";
import { withRepoCheckout } from "./repo-checkout";

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

function collectRegressionAlerts(
  db: Db,
  projectId: string,
  assessmentId: string,
  trigger: string,
): Alert[] {
  const alerts: Alert[] = [];
  for (const record of db.evidence) {
    if (
      record.assessmentId === assessmentId &&
      record.kind === "requirement_status_changed" &&
      record.detail?.regression === true
    ) {
      alerts.push({
        id: crypto.randomUUID(),
        projectId,
        kind: "compliance_regression",
        summary: `${record.summary} (triggered by ${trigger})`,
        at: new Date().toISOString(),
        read: false,
        assessmentId,
        detail: { ...record.detail, trigger },
      });
    }
  }
  return alerts;
}

function isHandledPrAction(action: string): action is HandledPrAction {
  return (HANDLED_PR_ACTIONS as readonly string[]).includes(action);
}

function repositoryFullName(
  payload: PushPayload | PullRequestPayload,
): string | undefined {
  const fullName = payload.repository?.full_name;
  return typeof fullName === "string" && fullName.length > 0
    ? fullName
    : undefined;
}

type HandledWebhookEvent =
  | { kind: "push"; payload: PushPayload }
  | {
      kind: "pull_request";
      payload: PullRequestPayload;
      action: HandledPrAction;
    };

function pullRequestHeadSha(payload: PullRequestPayload): string | null {
  const sha = payload.pull_request?.head?.sha;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

function pushHeadSha(payload: PushPayload): string | null {
  const after = payload.after;
  return typeof after === "string" && /^[0-9a-f]{40}$/i.test(after)
    ? after
    : null;
}

function triggerFor(event: HandledWebhookEvent): string {
  switch (event.kind) {
    case "push":
      return `push ${typeof event.payload.ref === "string" ? event.payload.ref : ""}`.trim();
    case "pull_request":
      return `pull_request ${event.action}`;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled webhook event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function checkoutRefFor(event: HandledWebhookEvent): string | undefined {
  switch (event.kind) {
    case "push":
      return pushHeadSha(event.payload) ?? undefined;
    case "pull_request":
      return pullRequestHeadSha(event.payload) ?? undefined;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled webhook event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export interface WebhookHandleResult {
  handled: boolean;
  message: string;
  alerts: Alert[];
  checkRun?: { ok: boolean; error?: string; htmlUrl?: string };
}

function parseHandledWebhookEvent(
  eventName: string,
  payload: unknown,
):
  | { ok: true; event: HandledWebhookEvent }
  | { ok: false; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, message: "Invalid payload" };
  }

  if (eventName === "push") {
    return { ok: true, event: { kind: "push", payload: payload as PushPayload } };
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

/**
 * Handles push / pull_request GitHub events for connected projects.
 * Ephemeral-clones the repo (at the event SHA when available), re-assesses,
 * emits regression alerts, and on PR events posts a Check Run.
 */
export async function handleGitHubWebhookEvent(
  eventName: string,
  payload: unknown,
): Promise<WebhookHandleResult> {
  const parsed = parseHandledWebhookEvent(eventName, payload);
  if (!parsed.ok) {
    return { handled: false, message: parsed.message, alerts: [] };
  }

  const { event } = parsed;
  const fullName = repositoryFullName(event.payload);
  if (!fullName) {
    return { handled: false, message: "No repository in payload", alerts: [] };
  }

  const preview = await loadDb();
  const previewProject = preview.projects.find(
    (candidate) =>
      candidate.source === "github" &&
      candidate.github?.fullName === fullName,
  );
  if (!previewProject) {
    return {
      handled: false,
      message: `No connected project for ${fullName}`,
      alerts: [],
    };
  }
  if (!previewProject.ownerUserId) {
    return {
      handled: false,
      message: "Connected project has no owner",
      alerts: [],
    };
  }

  const token = await resolveProjectGitHubToken(previewProject);
  if (!token) {
    const message = previewProject.github?.installationId
      ? "Could not mint a GitHub App installation token for this repository."
      : "No stored GitHub token for project owner - sign in again to refresh the token.";
    reportWarning(message, {
      code: "github_token_missing",
      projectId: previewProject.id,
      ownerUserId: previewProject.ownerUserId,
      fullName,
    });
    return {
      handled: false,
      message,
      alerts: [],
    };
  }

  const trigger = triggerFor(event);
  const ref = checkoutRefFor(event);

  try {
    return await withRepoCheckout(
      { fullName, accessToken: token, ref },
      async (rootPath) =>
        withDbWrite(async (db) => {
          const project = db.projects.find(
            (candidate) =>
              candidate.source === "github" &&
              candidate.github?.fullName === fullName,
          );
          if (!project) {
            return {
              handled: false,
              message: `No connected project for ${fullName}`,
              alerts: [],
            };
          }

          const assessment = await runAssessment(db, project.id, { rootPath });
          const alerts = collectRegressionAlerts(
            db,
            project.id,
            assessment.id,
            trigger,
          );

          db.alerts.push(...alerts);

          let checkRun: WebhookHandleResult["checkRun"];
          if (event.kind === "pull_request") {
            const headSha = pullRequestHeadSha(event.payload);
            if (headSha) {
              const openViolations = db.findings.filter(
                (finding) =>
                  finding.projectId === project.id &&
                  finding.status === "open" &&
                  finding.kind === "violation",
              ).length;
              const failedRequirements = db.requirements.filter(
                (requirement) =>
                  requirement.projectId === project.id &&
                  requirement.status === "failed",
              ).length;
              const summary = summarizeAssessmentForCheckRun({
                openViolations,
                failedRequirements,
                assessmentId: assessment.id,
              });
              const posted = await postPullRequestCheckRun({
                fullName,
                headSha,
                token,
                ...summary,
              });
              checkRun = {
                ok: posted.ok,
                error: posted.error,
                htmlUrl: posted.htmlUrl,
              };
            } else {
              checkRun = { ok: false, error: "Missing pull_request.head.sha" };
            }
          }

          addEvidence(db, {
            kind: "webhook_reassessment",
            summary: `Webhook re-assessment of ${fullName} after ${trigger}${alerts.length > 0 ? ` — ${alerts.length} regression(s)` : ""}${
              checkRun
                ? checkRun.ok
                  ? " — Check Run posted"
                  : ` — Check Run failed: ${checkRun.error ?? "unknown"}`
                : ""
            }`,
            projectId: project.id,
            assessmentId: assessment.id,
            detail: {
              eventName,
              fullName,
              trigger,
              regressionCount: alerts.length,
              checkRun,
              ref: ref ?? null,
            },
          });

          return {
            handled: true,
            message: `Re-assessed ${fullName}; ${alerts.length} regression alert(s)`,
            alerts,
            checkRun,
          };
        }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? `Failed to clone ${fullName} for webhook assessment: ${error.message}`
        : `Failed to clone ${fullName} for webhook assessment.`;
    reportError(error instanceof Error ? error : new Error(message), {
      code: "webhook_clone_failed",
      projectId: previewProject.id,
      fullName,
    });
    return { handled: false, message, alerts: [] };
  }
}
