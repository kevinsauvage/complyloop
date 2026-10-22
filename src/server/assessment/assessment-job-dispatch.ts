import "server-only";

import {
  appRepoFullName,
  vercelGitRepoOwner,
  vercelGitRepoSlug,
  workerDispatchToken,
} from "../env";
import { reportWarning } from "../observability";

/** `repository_dispatch` type the `assessment-worker` workflow listens for. */
export const ASSESSMENT_DRAIN_EVENT_TYPE = "assessment-drain";

/**
 * Upper bound for the kick itself: it runs inside `after()`, where a hung
 * socket would hold the task past any useful window (the 15-min schedule
 * backstop covers whatever this misses).
 */
const DISPATCH_TIMEOUT_MS = 15_000;

function appRepo(): { owner: string; repo: string } | null {
  const full = appRepoFullName();
  if (full) {
    const [owner, repo] = full.split("/");
    if (owner?.trim() && repo?.trim()) {
      return { owner: owner.trim(), repo: repo.trim() };
    }
  }
  // Vercel sets these automatically for git-connected projects.
  const owner = vercelGitRepoOwner();
  const repo = vercelGitRepoSlug();
  return owner && repo ? { owner, repo } : null;
}

/**
 * Kicks the GitHub Actions executor via `repository_dispatch`. Returns true
 * when GitHub accepted the event, false when unconfigured or rejected.
 * Never throws and never logs the token — a failed dispatch leaves the job
 * queued for the executor's 15-minute schedule (lease recovery reclaims it).
 */
export async function dispatchAssessmentWorker(): Promise<boolean> {
  try {
    const token = workerDispatchToken();
    const repo = appRepo();
    if (!token || !repo) return false;
    const response = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ event_type: ASSESSMENT_DRAIN_EVENT_TYPE }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      },
    );
    if (response.status === 204) return true;
    throw new Error(`dispatch responded ${response.status}.`);
  } catch (error) {
    reportWarning("assessment worker dispatch failed", {
      code: "assessment_worker_dispatch_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
