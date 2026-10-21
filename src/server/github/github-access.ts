import "server-only";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { isE2EHarnessEnabled } from "../e2e-harness";
import {
  createOctokit,
  mapGitHubRepo,
  octokitErrorMessage,
  parseOwnerRepo,
} from "./github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "./github-app";
import type { GitHubRepoSummary } from "./github-types";

export type { GitHubRepoSummary } from "./github-types";

/**
 * Token for clone / PR / Checks against a connected GitHub project.
 * Always a GitHub App installation token — short-lived, scoped to the repos
 * where the App is installed, independent of any dashboard session.
 */
export async function resolveProjectGitHubToken(
  project: Project,
): Promise<string | null> {
  const installationId = project.github?.installationId;
  if (
    installationId != null &&
    Number.isFinite(installationId) &&
    isGitHubAppConfigured()
  ) {
    return createInstallationAccessToken(installationId);
  }

  // E2E harness has no GitHub App installation: return the seeded stub
  // token so fixture checkouts and PR flows can resolve a token offline.
  if (isE2EHarnessEnabled()) {
    return process.env.E2E_GITHUB_TOKEN ?? "ghx_e2e_mock_check";
  }

  return null;
}

export async function fetchGitHubRepo(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepoSummary> {
  const { owner, repo } = parseOwnerRepo(fullName);
  const octokit = createOctokit(accessToken);
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return mapGitHubRepo(data);
  } catch (error) {
    throw new PublicError(
      octokitErrorMessage(error, `Could not load repository ${fullName}`),
      "connect",
    );
  }
}

/**
 * Fails with a user-facing message unless `branch` exists in the repository.
 * Used when a project is pointed at a tracked branch: a typo would otherwise
 * make every webhook for the project silently ignored.
 */
export async function assertBranchExists(
  accessToken: string,
  fullName: string,
  branch: string,
): Promise<void> {
  const { owner, repo } = parseOwnerRepo(fullName);
  try {
    await createOctokit(accessToken).rest.repos.getBranch({
      owner,
      repo,
      branch,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 404) {
      throw new PublicError(
        `Branch "${branch}" does not exist in ${fullName}.`,
        "ref_not_found",
      );
    }
    throw new PublicError(
      octokitErrorMessage(error, "Could not verify the branch on GitHub."),
      "connect",
    );
  }
}
