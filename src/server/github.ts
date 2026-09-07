import { Octokit } from "@octokit/rest";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
  listReposViaInstallations,
} from "./github-app";
import { getStoredGitHubToken } from "./github-tokens";

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
