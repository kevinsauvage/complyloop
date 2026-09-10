import "server-only";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
  listReposViaInstallations,
} from "./github-app";
import {
  createOctokit,
  mapGitHubRepo,
  octokitErrorMessage,
  parseOwnerRepo,
} from "./github";
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

  return null;
}

/**
 * Lists repositories available to connect: only repos on GitHub App
 * installations the signed-in user can access.
 */
export async function listGitHubRepos(options: {
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
