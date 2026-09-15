/**
 * GitHub connector facade — the single entry point for app/assessment code
 * that needs GitHub. Internal modules (`github.ts`, `github-app.ts`,
 * `github-access.ts`, `git.ts`, `pr.ts`, `github-checks.ts`,
 * `github-tokens.ts`, `webhook-deliveries.ts`) are leaves: Octokit details,
 * token cryptography, and git plumbing stay behind this facade.
 *
 * Out of scope (different owners): ephemeral checkouts
 * (`assessment/repo-checkout.ts` composes token + clone), user-scoped App
 * installation setup during connect (`github-app.ts` via `actions/connect.ts`),
 * and webhook delivery idempotency (the webhook route).
 */
import "server-only";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import type { PatchCandidate } from "@/ai/verified-fix";

import { reportWarning } from "../observability";
import { fetchGitHubRepo, resolveProjectGitHubToken } from "./github-access";
import { listReposViaInstallations } from "./github-app";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import type { GitHubRepoSummary } from "./github-types";
import { preparePullRequest, type PullRequestResult } from "./pr";

export type { GitHubRepoSummary };

/** Installation token for clone / PR / Checks. Null when not App-connected. */
export { resolveProjectGitHubToken as getProjectToken };

/** Repositories available to connect for a signed-in user's access token. */
export function listAvailableRepos(options: {
  accessToken: string;
  perPage?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  return listReposViaInstallations({
    userAccessToken: options.accessToken,
    perPage: options.perPage,
    q: options.q,
  });
}

/** Single repository metadata for a user access token (connect flow). */
export function fetchRepo(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepoSummary> {
  return fetchGitHubRepo(accessToken, fullName);
}

/**
 * Apply a verified patch on a fresh checkout, then commit, push, and open a
 * draft PR. Checkout + token handling stay inside `pr.ts`.
 */
export function createProjectPullRequest(
  project: Project,
  control: Control,
  finding: Finding,
  remediation: Remediation,
  candidate: PatchCandidate | null,
): Promise<PullRequestResult> {
  return preparePullRequest(project, control, finding, remediation, candidate);
}

/**
 * Post the assessment Check Run on a PR head commit. Resolves the project
 * token internally and warns (never throws) when posting is impossible, so
 * the worker stays on its load → run → apply shape.
 */
export async function postAssessmentCheckRun(input: {
  project: Project;
  jobId: string;
  headSha: string;
  openViolations: number;
  failedRequirements: number;
  assessmentId: string;
}): Promise<void> {
  const { project, jobId, headSha } = input;
  try {
    const token = await resolveProjectGitHubToken(project);
    if (!token || !project.github?.fullName) {
      reportWarning(
        "Could not post pull-request check: GitHub token unavailable.",
        {
          code: "github_token_missing",
          projectId: project.id,
          jobId,
        },
      );
      return;
    }
    const posted = await postPullRequestCheckRun({
      fullName: project.github.fullName,
      headSha,
      token,
      ...summarizeAssessmentForCheckRun({
        openViolations: input.openViolations,
        failedRequirements: input.failedRequirements,
        assessmentId: input.assessmentId,
      }),
    });
    if (!posted.ok) {
      reportWarning("Pull-request Check Run could not be posted.", {
        code: "github_check_run_failed",
        projectId: project.id,
        jobId,
        error: posted.error,
      });
    }
  } catch (error) {
    // Token resolution throws (PublicError) — a missing check must never fail
    // an otherwise successful assessment job.
    reportWarning(
      error instanceof Error ? error.message : "Check Run post failed.",
      {
        code: "github_check_run_failed",
        projectId: project.id,
        jobId,
      },
    );
  }
}
