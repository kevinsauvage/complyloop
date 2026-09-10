import "server-only";

import { isPublicError } from "@complyloop/analysis-core/contract/public-error";

import { createOctokit, octokitErrorMessage, parseOwnerRepo } from "./github";

export interface CheckRunInput {
  fullName: string;
  headSha: string;
  token: string;
  conclusion: "success" | "failure" | "neutral";
  title: string;
  summary: string;
}

export interface CheckRunResult {
  ok: boolean;
  error?: string;
  checkRunId?: number;
  htmlUrl?: string;
}

/**
 * Posts a completed GitHub Check Run on the PR head commit (Checks API).
 * Requires a token with the Checks permission (installation token).
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
  try {
    const { data } = await octokit.rest.checks.create({
      owner,
      repo,
      name: "ComplyLoop",
      head_sha: input.headSha,
      status: "completed",
      conclusion: input.conclusion,
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

export function summarizeAssessmentForCheckRun(input: {
  openViolations: number;
  failedRequirements: number;
  assessmentId: string;
}): { conclusion: "success" | "failure"; title: string; summary: string } {
  const failing =
    input.openViolations > 0 || input.failedRequirements > 0;
  if (!failing) {
    return {
      conclusion: "success",
      title: "Compliance assessment passed",
      summary: [
        "ComplyLoop re-assessed this pull request.",
        "",
        `- Open violations: ${input.openViolations}`,
        `- Failed requirements: ${input.failedRequirements}`,
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
      `- Assessment id: \`${input.assessmentId}\``,
      "",
      "Open the ComplyLoop dashboard for findings, remediations, and evidence.",
    ].join("\n"),
  };
}
