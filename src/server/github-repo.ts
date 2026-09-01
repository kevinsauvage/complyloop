import { ConnectError } from "./connect-error";

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

type GitHubRepoApiShape = {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  default_branch?: string | null;
  updated_at?: string | null;
  html_url: string;
  clone_url: string;
};

/** Maps a GitHub REST repo payload into our connect picker summary. */
export function mapGitHubRepo(
  repo: GitHubRepoApiShape,
  installationId?: number,
): GitHubRepoSummary {
  return {
    fullName: repo.full_name,
    name: repo.name,
    description: repo.description,
    private: repo.private,
    defaultBranch: repo.default_branch ?? "main",
    updatedAt: repo.updated_at ?? "",
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    ...(installationId != null ? { installationId } : {}),
  };
}

function repoOwner(fullName: string): string {
  return fullName.split("/")[0] ?? fullName;
}

export type RepoOwnerGroup = {
  owner: string;
  repos: GitHubRepoSummary[];
};

/** Groups repos by GitHub owner/org, sorted alphabetically. */
export function groupReposByOwner(repos: GitHubRepoSummary[]): RepoOwnerGroup[] {
  const byOwner = new Map<string, GitHubRepoSummary[]>();
  for (const repo of repos) {
    const owner = repoOwner(repo.fullName);
    const list = byOwner.get(owner) ?? [];
    list.push(repo);
    byOwner.set(owner, list);
  }
  return [...byOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, ownerRepos]) => ({ owner, repos: ownerRepos }));
}

/** Case-insensitive filter on full name / description for the repo picker. */
export function filterReposByQuery(
  repos: GitHubRepoSummary[],
  q: string | undefined,
): GitHubRepoSummary[] {
  const needle = q?.trim().toLowerCase();
  if (!needle) return repos;
  return repos.filter(
    (repo) =>
      repo.fullName.toLowerCase().includes(needle) ||
      (repo.description?.toLowerCase().includes(needle) ?? false),
  );
}

/** Splits `owner/repo` or throws when the full name is invalid. */
export function parseOwnerRepo(fullName: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new ConnectError(`Invalid repository full name: ${fullName}`);
  }
  return { owner, repo };
}
