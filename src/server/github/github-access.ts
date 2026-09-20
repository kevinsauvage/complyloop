import "server-only";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

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
  if (process.env.E2E_AUTH_ENABLED === "1") {
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
