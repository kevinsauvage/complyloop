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
 * (`assessment/repo-checkout.ts` composes token + clone), user-scoped App
 * installation setup during connect (`github-app.ts` via `actions/connect.ts`),
 * and webhook delivery idempotency (the webhook route).
 */
import "server-only";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import type { PatchCandidate } from "@/ai/verified-fix";

import { fetchGitHubRepo, resolveProjectGitHubToken } from "./github-access";
import { githubAppInstallUrl, listReposViaInstallations } from "./github-app";
import type { GitHubRepoSummary } from "./github-types";
import { preparePullRequest, type PullRequestResult } from "./pr";

export type { GitHubRepoSummary };

/** Installation token for clone / PR / Checks. Null when not App-connected. */
export { resolveProjectGitHubToken as getProjectToken };

/** Public install URL for the GitHub App (repair banner, picker empty state). */
export { githubAppInstallUrl };

/** Repositories available to connect for a signed-in user's access token. */
export function listAvailableRepos(options: {
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

/** Single repository metadata for a user access token (connect flow). */
export function fetchRepo(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepoSummary> {
  return fetchGitHubRepo(accessToken, fullName);
}

/**
 * Apply a verified patch on a fresh checkout, then commit, push, and open a
 * draft PR. Checkout + token handling stay inside `pr.ts`.
 */
export function createProjectPullRequest(
  project: Project,
  control: Control,
  finding: Finding,
  remediation: Remediation,
  candidate: PatchCandidate | null,
): Promise<PullRequestResult> {
  return preparePullRequest(project, control, finding, remediation, candidate);
}


