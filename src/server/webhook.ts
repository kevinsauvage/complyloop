import { verify as verifyWebhookSignature } from "@octokit/webhooks-methods";
import fs from "node:fs";
import type { Alert } from "@/core/types";
import { runAssessment } from "./assessment";
import { githubCloneUrl } from "./connect";
import { addEvidence, loadDb, withDbWrite, type Db } from "./db";
import { createGit } from "./git";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import { getStoredGitHubToken } from "./github-tokens";

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

async function pullLatest(
  rootPath: string,
  fullName: string,
  token: string,
): Promise<void> {
  const remote = githubCloneUrl(fullName, token);
  const git = createGit({
    baseDir: rootPath,
    config: ["core.askPass="],
  });

  await git.remote(["set-url", "origin", remote]);
  try {
    await git.fetch(["--depth", "1", "origin"]);
    const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const target = branch === "HEAD" ? "origin/HEAD" : `origin/${branch}`;
    await git.reset(["--hard", target]);
  } finally {
    // Never leave the token in the remote URL on disk.
    await git.remote([
      "set-url",
      "origin",
      `https://github.com/${fullName}.git`,
    ]);
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

function pullRequestHeadSha(payload: Record<string, unknown>): string | null {
  const pr = payload.pull_request as
    | { head?: { sha?: string } }
    | undefined;
  const sha = pr?.head?.sha;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

export interface WebhookHandleResult {
  handled: boolean;
  message: string;
  alerts: Alert[];
  checkRun?: { ok: boolean; error?: string; htmlUrl?: string };
}

/**
 * Handles push / pull_request GitHub events for connected projects.
 * Re-pulls the clone, re-assesses, emits regression alerts, and on PR events
 * posts a Check Run on the head commit.
 */
export async function handleGitHubWebhookEvent(
  eventName: string,
  payload: Record<string, unknown>,
): Promise<WebhookHandleResult> {
  const repo = payload.repository as
    | { full_name?: string; private?: boolean }
    | undefined;
  const fullName = repo?.full_name;
  if (!fullName) {
    return { handled: false, message: "No repository in payload", alerts: [] };
  }

  const isPush = eventName === "push";
  const isPr =
    eventName === "pull_request" &&
    typeof payload.action === "string" &&
    ["opened", "synchronize", "reopened"].includes(payload.action);

  if (!isPush && !isPr) {
    return {
      handled: false,
      message: `Ignored event ${eventName}`,
      alerts: [],
    };
  }

  // Resolve project + token without holding the write lock (clone pull is slow).
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
  if (!fs.existsSync(previewProject.rootPath)) {
    return {
      handled: false,
      message: `Workspace missing for ${fullName}`,
      alerts: [],
    };
  }

  const token = await getStoredGitHubToken(previewProject.ownerUserId);
  if (!token) {
    return {
      handled: false,
      message:
        "No stored GitHub token for project owner — sign in again to refresh the token.",
      alerts: [],
    };
  }

  const trigger = isPush
    ? `push ${typeof payload.ref === "string" ? payload.ref : ""}`.trim()
    : `pull_request ${String(payload.action)}`;

  await pullLatest(previewProject.rootPath, fullName, token);

  return withDbWrite(async (db) => {
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

    const assessment = runAssessment(db, project.id);
    const alerts = collectRegressionAlerts(
      db,
      project.id,
      assessment.id,
      trigger,
    );

    db.alerts.push(...alerts);

    let checkRun: WebhookHandleResult["checkRun"];
    if (isPr) {
      const headSha = pullRequestHeadSha(payload);
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
      },
    });

    return {
      handled: true,
      message: `Re-assessed ${fullName}; ${alerts.length} regression alert(s)`,
      alerts,
      checkRun,
    };
  });
}
