import "server-only";

import { isPublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";

import { createOctokit, octokitErrorMessage, parseOwnerRepo } from "./github";

export const CHECK_RUN_NAME = "ComplyLoop";

export type CheckRunStatus = "queued" | "in_progress" | "completed";

export interface CheckRunInput {
  fullName: string;
  headSha: string;
  token: string;
  /** Lifecycle status. Defaults to `completed` for backwards compatibility. */
  status?: CheckRunStatus;
  /** Required when `status` is `completed`; omitted for queued/in_progress. */
  conclusion?: "success" | "failure" | "neutral";
  title: string;
  summary: string;
  /** Deep link into ComplyLoop (assessment/finding page). */
  detailsUrl?: string;
  /** Assessment job id for correlation. */
  externalId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CheckRunResult {
  ok: boolean;
  error?: string;
  checkRunId?: number;
  htmlUrl?: string;
}

/**
 * Posts a GitHub Check Run on the PR head commit (Checks API).
 * Requires a token with the Checks permission (installation token).
 *
 * Lifecycle: `queued` on enqueue (fire-and-forget) → `in_progress` on claim →
 * `completed` with the verdict. `conclusion` is only sent for `completed`
 * runs (the API rejects it otherwise). Fork pushes carry an empty
 * `pull_requests` list — posting by SHA still works, so no special-casing.
 * Never throws: callers treat a non-ok result as warn-only.
 */
export async function postPullRequestCheckRun(
  input: CheckRunInput,
): Promise<CheckRunResult> {
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseOwnerRepo(input.fullName));
  } catch (error) {
    return {
      ok: false,
      error:
        isPublicError(error) && error.code === "connect"
          ? error.message
          : `Invalid repository full name: ${input.fullName}`,
    };
  }

  const octokit = createOctokit(input.token);
  const status = input.status ?? "completed";
  try {
    const { data } = await octokit.rest.checks.create({
      owner,
      repo,
      name: CHECK_RUN_NAME,
      head_sha: input.headSha,
      status,
      ...(status === "completed"
        ? { conclusion: input.conclusion ?? "neutral" }
        : {}),
      ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
      ...(input.externalId ? { external_id: input.externalId } : {}),
      ...(input.startedAt ? { started_at: input.startedAt } : {}),
      ...(status === "completed" && input.completedAt
        ? { completed_at: input.completedAt }
        : {}),
      output: {
        title: input.title,
        summary: input.summary,
      },
    });
    return {
      ok: true,
      checkRunId: data.id,
      htmlUrl: data.html_url ?? undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: octokitErrorMessage(error, "GitHub Checks API"),
    };
  }
}

export interface AssessmentCheckSummaryInput {
  openViolations: number;
  failedRequirements: number;
  assessmentId: string;
  /** Open-violation counts by severity for the breakdown line. */
  severity?: Partial<Record<Severity, number>>;
}

export function summarizeAssessmentForCheckRun(input: {
  openViolations: number;
  failedRequirements: number;
  assessmentId: string;
  severity?: Partial<Record<Severity, number>>;
}): { conclusion: "success" | "failure"; title: string; summary: string } {
  const severityLine = formatSeverityBreakdown(input.severity);
  const failing = input.openViolations > 0 || input.failedRequirements > 0;
  if (!failing) {
    return {
      conclusion: "success",
      title: "Compliance assessment passed",
      summary: [
        "ComplyLoop re-assessed this pull request.",
        "",
        `- Open violations: ${input.openViolations}`,
        `- Failed requirements: ${input.failedRequirements}`,
        ...(severityLine ? [`- Severity: ${severityLine}`] : []),
        `- Assessment id: \`${input.assessmentId}\``,
      ].join("\n"),
    };
  }
  return {
    conclusion: "failure",
    title: `${input.openViolations} open violation(s), ${input.failedRequirements} failed requirement(s)`,
    summary: [
      "ComplyLoop found compliance failures on this pull request.",
      "",
      `- Open violations: ${input.openViolations}`,
      `- Failed requirements: ${input.failedRequirements}`,
      ...(severityLine ? [`- Severity: ${severityLine}`] : []),
      `- Assessment id: \`${input.assessmentId}\``,
      "",
      "Open the ComplyLoop dashboard for findings, remediations, and evidence.",
    ].join("\n"),
  };
}

function formatSeverityBreakdown(
  severity?: Partial<Record<Severity, number>>,
): string | null {
  if (!severity) return null;
  const parts: string[] = [];
  for (const level of ["critical", "serious", "moderate", "minor"] as const) {
    const count = severity[level] ?? 0;
    if (count > 0) parts.push(`${level} ${count}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Progress title/summary for the `queued` Check posted on enqueue. */
export function summarizeQueuedCheckRun(jobId: string): {
  title: string;
  summary: string;
} {
  return {
    title: "Compliance assessment queued",
    summary: [
      "ComplyLoop queued the assessment for this pull request.",
      "",
      `- Job id: \`${jobId}\``,
      "",
      "The check updates to in-progress when the worker claims the job.",
    ].join("\n"),
  };
}

/** Progress title/summary for the `in_progress` Check posted on claim. */
export function summarizeInProgressCheckRun(jobId: string): {
  title: string;
  summary: string;
} {
  return {
    title: "Compliance assessment in progress",
    summary: [
      "ComplyLoop is scanning this pull request.",
      "",
      `- Job id: \`${jobId}\``,
      "",
      "The completed verdict (with severity breakdown) posts here when the scan finishes.",
    ].join("\n"),
  };
}

/**
 * Terminal worker crash (not a verdict): the scan never produced results, so
 * the PR must not sit on "expected checks" forever. Posted only on terminal
 * failure — retries stay quiet and post the real verdict later.
 */
export function summarizeAssessmentFailureForCheckRun(error: unknown): {
  conclusion: "failure";
  title: string;
  summary: string;
} {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return {
    conclusion: "failure",
    title: "Compliance assessment failed to run",
    summary: [
      "ComplyLoop could not complete the assessment for this pull request.",
      "",
      `Error: ${message.slice(0, 500)}`,
      "",
      "Fix the worker/runner problem (or retry the assessment) — this is not a compliance verdict.",
    ].join("\n"),
  };
}
