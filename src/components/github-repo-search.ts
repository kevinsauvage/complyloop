import type { GitHubRepoSummary } from "@/server/github/github-types";

/*
 * Client-safe guard for the `/api/github/repos` response. Kept out of
 * `src/core` (which must not import server types) and hand-written instead of
 * a zod schema, so the picker bundle stays zod-free. The server route
 * validates its own inputs with local schemas in `@/core/validate`.
 */

export interface GitHubRepoSearchResponse {
  repos: GitHubRepoSummary[];
  hasMore: boolean;
  error?: string;
}

const PARSE_ERROR = "Could not load repositories.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRepoSummary(value: unknown): value is GitHubRepoSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.fullName === "string" &&
    typeof value.name === "string" &&
    (value.description === null || typeof value.description === "string") &&
    typeof value.private === "boolean" &&
    typeof value.defaultBranch === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.htmlUrl === "string" &&
    typeof value.cloneUrl === "string" &&
    (value.installationId === undefined ||
      typeof value.installationId === "number")
  );
}

/** Reads the `error` field from a failed API response body, if present. */
export function githubRepoSearchError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.error === "string" ? value.error : undefined;
}

export function parseGitHubRepoSearchResponse(
  value: unknown,
): GitHubRepoSearchResponse {
  if (!isRecord(value)) throw new Error(PARSE_ERROR);
  const { repos, hasMore, error } = value;
  if (!Array.isArray(repos) || !repos.every(isRepoSummary)) {
    throw new Error(PARSE_ERROR);
  }
  if (typeof hasMore !== "boolean") throw new Error(PARSE_ERROR);
  if (error !== undefined && typeof error !== "string") {
    throw new Error(PARSE_ERROR);
  }
  return { repos, hasMore, ...(error !== undefined ? { error } : {}) };
}
