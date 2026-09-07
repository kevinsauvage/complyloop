import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
  listReposViaInstallations,
} from "./github-app";
import {
  createOctokit,
  filterReposByQuery,
  mapGitHubRepo,
  octokitErrorMessage,
  parseOwnerRepo,
  type GitHubRepoSummary,
} from "./github-helpers";
import { getStoredGitHubToken } from "./github-tokens";

export {
  createOctokit,
  filterReposByQuery,
  mapGitHubRepo,
  octokitErrorMessage,
  parseOwnerRepo,
  type GitHubRepoSummary,
} from "./github-helpers";

export interface ResolveProjectGitHubTokenOptions {
  /** Prefer this token when already resolved by the caller (session OAuth). */
  sessionAccessToken?: string | null;
}

/**
 * Token for clone / PR / Checks against a connected GitHub project.
 * Prefers a GitHub App installation token when the project was connected
 * under an App install (least privilege, selected repos only).
 */
export async function resolveProjectGitHubToken(
  project: Project,
  options: ResolveProjectGitHubTokenOptions = {},
): Promise<string | null> {
  const installationId = project.github?.installationId;
  if (
    installationId != null &&
    Number.isFinite(installationId) &&
    isGitHubAppConfigured()
  ) {
    return createInstallationAccessToken(installationId);
  }

  if (options.sessionAccessToken) {
    return options.sessionAccessToken;
  }

  if (project.ownerUserId) {
    const ownerToken = await getStoredGitHubToken(project.ownerUserId);
    if (ownerToken) return ownerToken;
  }

  return null;
}

/**
 * Lists repositories available to connect.
 * With a GitHub App configured: only repos on installations the user can access.
 * Without: classic OAuth `repo` scope listing (laptop demo only).
 */
export async function listGitHubRepos(options: {
  accessToken: string;
  page?: number;
  perPage?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  if (isGitHubAppConfigured()) {
    return listReposViaInstallations({
      userAccessToken: options.accessToken,
      perPage: options.perPage,
      q: options.q,
    });
  }

  const octokit = createOctokit(options.accessToken);
  const page = options.page ?? 1;
  const perPage = Math.min(options.perPage ?? 30, 100);

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      direction: "desc",
      affiliation: "owner,collaborator,organization_member",
      page,
      per_page: perPage,
    });
    return filterReposByQuery(data.map((repo) => mapGitHubRepo(repo)), options.q);
  } catch (error) {
    throw new PublicError(
      octokitErrorMessage(error, "GitHub API error"),
      "connect",
    );
  }
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
