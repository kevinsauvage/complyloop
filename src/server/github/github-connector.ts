/**
 * GitHub connector facade — the single entry point for app/assessment code
 * that needs GitHub *operations* (repo listing, install tokens, PRs, Check
 * Runs). Internal modules (`github.ts`, `github-app.ts`, `github-access.ts`,
 * `pr.ts`, `github-checks.ts`, `github-tokens.ts`, `webhook-deliveries.ts`)
 * are leaves: Octokit details, token cryptography, and git plumbing stay
 * behind this facade.
 *
 * Deliberate direct-leaf imports (not facade violations):
 * - `github-tokens.ts` crypto + `access-token.ts` request vault (`next/*`):
 *   the auth root (`src/auth.ts`), `access-token.ts` consumers, and token
 *   seeding import these directly. The connector must stay worker-bundle-safe
 *   (the GH action bundles it via `scripts/build-worker.mjs` — no `next/*`
 *   imports allowed here), so the request-scoped token vault stays a leaf.
 * - `webhook-deliveries.ts` idempotency: owned by the webhook route.
 * - `assertProductionGitHubApp` in the auth root: composition-root config
 *   gate, not an operation.
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
import type { Severity } from "@complyloop/analysis-core/contract/statuses";

import type { PatchCandidate } from "@/ai/verified-fix";

import { appUrl } from "../env";
import { reportWarning } from "../observability";
import { fetchGitHubRepo, resolveProjectGitHubToken } from "./github-access";
import { githubAppInstallUrl, listReposViaInstallations } from "./github-app";
import {
  CHECK_RUN_NAME,
  postPullRequestCheckRun,
  summarizeAssessmentFailureForCheckRun,
  summarizeAssessmentForCheckRun,
  summarizeInProgressCheckRun,
  summarizeQueuedCheckRun,
} from "./github-checks";
import type { GitHubRepoSummary } from "./github-types";
import { preparePullRequest, type PullRequestResult } from "./pr";

export type { GitHubRepoSummary };

/** Installation token for clone / PR / Checks. Null when not App-connected. */
export { resolveProjectGitHubToken as getProjectToken };

/** Public install URL for the GitHub App (repair banner, picker empty state). */
export { githubAppInstallUrl };

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
 * Deep link for the Check Run `details_url`: project compliance page when the
 * app URL is configured, otherwise undefined (Checks API omits it).
 */
export function assessmentDetailsUrl(
  projectId: string,
  assessmentId: string,
): string | undefined {
  const base = appUrl()?.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}/projects/${projectId}/assessments/${assessmentId}`;
}

export { CHECK_RUN_NAME };

/**
 * Shared Check Run post: resolves the project token internally and warns
 * (never throws) when posting is impossible, so the worker stays on its
 * load → run → apply shape.
 */
async function postCheckRunSafely(input: {
  project: Project;
  jobId: string;
  headSha: string;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  title: string;
  summary: string;
  detailsUrl?: string;
  startedAt?: string;
  completedAt?: string;
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
      status: input.status ?? "completed",
      conclusion: input.conclusion,
      title: input.title,
      summary: input.summary,
      detailsUrl: input.detailsUrl,
      externalId: jobId,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
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

/**
 * Post the `queued` Check Run on a PR head commit. Fire-and-forget from the
 * webhook enqueue path — never throws.
 */
export async function postQueuedCheckRunForPreview(input: {
  project: Project;
  jobId: string;
  headSha: string;
  startedAt?: string;
}): Promise<void> {
  await postCheckRunSafely({
    project: input.project,
    jobId: input.jobId,
    headSha: input.headSha,
    status: "queued",
    startedAt: input.startedAt,
    ...summarizeQueuedCheckRun(input.jobId),
  });
}

/**
 * Post the `in_progress` Check Run when the worker claims a PR preview job.
 * Never throws.
 */
export async function postInProgressCheckRunForPreview(input: {
  project: Project;
  jobId: string;
  headSha: string;
  startedAt?: string;
}): Promise<void> {
  await postCheckRunSafely({
    project: input.project,
    jobId: input.jobId,
    headSha: input.headSha,
    status: "in_progress",
    startedAt: input.startedAt,
    ...summarizeInProgressCheckRun(input.jobId),
  });
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
  severity?: Partial<Record<Severity, number>>;
  startedAt?: string;
  completedAt?: string;
}): Promise<void> {
  await postCheckRunSafely({
    project: input.project,
    jobId: input.jobId,
    headSha: input.headSha,
    status: "completed",
    detailsUrl: assessmentDetailsUrl(input.project.id, input.assessmentId),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...summarizeAssessmentForCheckRun({
      openViolations: input.openViolations,
      failedRequirements: input.failedRequirements,
      assessmentId: input.assessmentId,
      severity: input.severity,
    }),
  });
}

/**
 * Post a `failure` Check Run when the worker itself crashes on a PR preview
 * scan — otherwise the PR waits on "expected checks" forever. Terminal
 * failures only; retries stay quiet. Never throws.
 */
export async function postAssessmentFailureCheckRun(input: {
  project: Project;
  jobId: string;
  headSha: string;
  error: unknown;
}): Promise<void> {
  await postCheckRunSafely({
    project: input.project,
    jobId: input.jobId,
    headSha: input.headSha,
    ...summarizeAssessmentFailureForCheckRun(input.error),
  });
}
