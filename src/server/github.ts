import { ConnectError } from "./connect-url";
import {
  isGitHubAppConfigured,
  listReposViaInstallations,
} from "./github-app";
import { createOctokit, octokitErrorMessage } from "./octokit";

export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  /** Present when listed via a GitHub App installation. */
  installationId?: number;
}

function mapRepo(repo: {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch?: string | null;
  updated_at?: string | null;
  html_url: string;
  clone_url: string;
}): GitHubRepoSummary {
  return {
    fullName: repo.full_name,
    name: repo.name,
    description: repo.description,
    private: repo.private,
    defaultBranch: repo.default_branch ?? "main",
    updatedAt: repo.updated_at ?? "",
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  };
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
    let repos = data.map(mapRepo);
    const q = options.q?.trim().toLowerCase();
    if (q) {
      repos = repos.filter(
        (repo) =>
          repo.fullName.toLowerCase().includes(q) ||
          (repo.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return repos;
  } catch (error) {
    throw new ConnectError(
      octokitErrorMessage(error, "GitHub API error"),
    );
  }
}

export async function fetchGitHubRepo(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepoSummary> {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new ConnectError(`Invalid repository full name: ${fullName}`);
  }
  const octokit = createOctokit(accessToken);
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return mapRepo(data);
  } catch (error) {
    throw new ConnectError(
      octokitErrorMessage(error, `Could not load repository ${fullName}`),
    );
  }
}
