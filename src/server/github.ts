import { Octokit } from "@octokit/rest";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { redactSecrets } from "./redact";

/** Authenticated Octokit client for server-side GitHub REST calls. */
export function createOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
    userAgent: "ComplyLoop",
    // Test / GitHub Enterprise Server override; defaults to api.github.com.
    ...(process.env.GITHUB_API_BASE_URL
      ? { baseUrl: process.env.GITHUB_API_BASE_URL }
      : {}),
  });
}

export function octokitErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    const message =
      "message" in error && typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : fallback;
    return `${fallback} (${status}): ${message.slice(0, 300)}`;
  }
  if (error instanceof Error) return `${fallback}: ${error.message.slice(0, 300)}`;
  return fallback;
}

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
    throw new PublicError(`Invalid repository full name: ${fullName}`, "connect");
  }
  return { owner, repo };
}

/** Builds an authenticated HTTPS clone URL for GitHub (token never stored). */
export function githubCloneUrl(fullName: string, accessToken: string): string {
  const encoded = encodeURIComponent(accessToken);
  return `https://x-access-token:${encoded}@github.com/${fullName}.git`;
}

/**
 * Token-free clone/push URL. Authenticate via `gitAuthEnv(token)` in the git
 * child env instead — the token must never appear in argv. Prefer this for
 * every new call site; `githubCloneUrl` is retained for existing tests only.
 */
export function githubPublicCloneUrl(fullName: string): string {
  const { owner, repo } = parseOwnerRepo(fullName);
  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * Strips embedded URL credentials (`https://user:pass@host/...`) and leaked
 * `Authorization` header values from git error output. Git echoes the remote
 * URL on failure, which would otherwise leak the clone token into
 * user-visible errors.
 */
export function redactCloneUrl(text: string): string {
  return redactSecrets(text);
}

/** GitHub full names are case-insensitive; normalize for map keys and equality. */
export function normalizeGitHubFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}
