/**
 * GitHub connector facade — the single entry point for app/assessment code
 * that needs GitHub *operations* (repo listing, install tokens, PRs).
 * Internal modules (`github.ts`, `github-app.ts`, `github-access.ts`,
 * `pr.ts`, `github-tokens.ts`, `webhook-deliveries.ts`)
 * are leaves: Octokit details, token cryptography, and git plumbing stay
 * behind this facade.
 *
 * Deliberate direct-leaf imports (not facade violations):
 * - `github-tokens.ts` crypto + `access-token.ts` request vault (`next/*`):
 *   the auth root (`src/auth.ts`), `access-token.ts` consumers, and token
 *   seeding import these directly. The connector must stay worker-bundle-safe
 *   (the GH action bundles it via `scripts/build-worker.mjs` — no `next/*`
 *   imports allowed here), so the request-scoped token vault stays a leaf.
 * - `webhook-deliveries.ts` idempotency: owned by the webhook route.
 * - `assertProductionGitHubApp` in the auth root: composition-root config
 *   gate, not an operation.
 *
 * Out of scope (different owners): ephemeral checkouts
 * (`assessment/repo-checkout.ts` composes token + clone), and webhook delivery
 * idempotency (the webhook route).
 */
import "server-only";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { type ChangedPath, compareCommitFiles } from "./compare";
import { fetchGitHubRepo, resolveProjectGitHubToken } from "./github-access";
import { assertBranchExists } from "./github-access";
import {
  createInstallationAccessToken,
  githubAppInstallUrl,
  isGitHubAppConfigured,
  listReposViaInstallations,
  resolveUserInstallationForRepo,
} from "./github-app";
import type { GitHubRepoSummary } from "./github-types";
import { preparePullRequest } from "./pr";

export type { GitHubRepoSummary };
export { assertBranchExists, isGitHubAppConfigured };
export { createInstallationAccessToken, resolveUserInstallationForRepo };

/** Installation token for clone / PR / Checks. Null when not App-connected. */
export { resolveProjectGitHubToken as getProjectToken };

/**
 * The project's repository and an installation token, or a `PublicError`
 * saying what to repair (missing metadata, or not connected via the App).
 */
export async function requireProjectRepoAccess(
  project: Project,
): Promise<{ fullName: string; accessToken: string }> {
  const fullName = project.github?.fullName;
  if (!fullName) {
    throw new PublicError(
      "Project has no GitHub repository metadata.",
      "connect",
    );
  }
  const accessToken = await resolveProjectGitHubToken(project);
  if (!accessToken) {
    throw new PublicError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "This project is not connected via the GitHub App. Reconnect it from Settings.",
      "connect",
    );
  }
  return { fullName, accessToken };
}

/** Public install URL for the GitHub App (repair banner, picker empty state). */
export { githubAppInstallUrl };

/** Repositories available to connect for a signed-in user's access token. */
export function listAvailableRepos(options: {
  accessToken: string;
  perPage?: number;
  page?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  return listReposViaInstallations({
    userAccessToken: options.accessToken,
    perPage: options.perPage,
    page: options.page,
    q: options.q,
  });
}

/** Single repository metadata for a user access token (connect flow). */
export { fetchGitHubRepo as fetchRepo };

/**
 * Files that differ between two commits of a connected project, or `null` when
 * the range cannot be compared (force-push, API or token failure, 300+ files).
 * `null` means "scan the whole tree".
 */
export async function compareProjectCommits(
  project: Project,
  base: string,
  head: string,
): Promise<ChangedPath[] | null> {
  const fullName = project.github?.fullName;
  if (!fullName) return null;
  // A token failure is one more "cannot compare": scan the whole tree rather
  // than fail the run.
  const accessToken = await resolveProjectGitHubToken(project).catch(
    () => null,
  );
  if (!accessToken) return null;
  return compareCommitFiles({ fullName, accessToken, base, head });
}

/**
 * Apply a verified patch on a fresh checkout, then commit, push, and open a
 * draft PR. Checkout + token handling stay inside `pr.ts`.
 */
export { preparePullRequest as createProjectPullRequest };
