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
 * Requires a token with `repo` (or `checks:write`) scope.
 */
export async function postPullRequestCheckRun(
  input: CheckRunInput,
): Promise<CheckRunResult> {
  const [owner, repo] = input.fullName.split("/");
  if (!owner || !repo) {
    return { ok: false, error: `Invalid repository full name: ${input.fullName}` };
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/check-runs`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "ComplyLoop",
        head_sha: input.headSha,
        status: "completed",
        conclusion: input.conclusion,
        output: {
          title: input.title,
          summary: input.summary,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      error: `GitHub Checks API ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  const payload = (await response.json()) as {
    id?: number;
    html_url?: string;
  };
  return {
    ok: true,
    checkRunId: payload.id,
    htmlUrl: payload.html_url,
  };
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
