import { ConnectError } from "./connect";

export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  cloneUrl: string;
}

interface GitHubApiRepo {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  html_url: string;
  clone_url: string;
}

function mapRepo(repo: GitHubApiRepo): GitHubRepoSummary {
  return {
    fullName: repo.full_name,
    name: repo.name,
    description: repo.description,
    private: repo.private,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  };
}

/**
 * Lists repositories the authenticated GitHub user can access.
 * Optional `q` filters by full name / description (client-friendly substring).
 */
export async function listGitHubRepos(options: {
  accessToken: string;
  page?: number;
  perPage?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  const page = options.page ?? 1;
  const perPage = Math.min(options.perPage ?? 30, 100);
  const url = new URL("https://api.github.com/user/repos");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ComplyLoop",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ConnectError(
      `GitHub API error (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as GitHubApiRepo[];
  let repos = payload.map(mapRepo);
  const q = options.q?.trim().toLowerCase();
  if (q) {
    repos = repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(q) ||
        (repo.description?.toLowerCase().includes(q) ?? false),
    );
  }
  return repos;
}

export async function fetchGitHubRepo(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepoSummary> {
  const response = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ComplyLoop",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ConnectError(
      `Could not load repository ${fullName} (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  return mapRepo((await response.json()) as GitHubApiRepo);
}
