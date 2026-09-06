import { PublicError } from "@complyloop/db/types";
import {
  isGitHubAppConfigured,
  listReposViaInstallations,
} from "./github-app";
import {
  filterReposByQuery,
  mapGitHubRepo,
  parseOwnerRepo,
  type GitHubRepoSummary,
} from "./github-repo";
import { createOctokit, octokitErrorMessage } from "./octokit";

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
