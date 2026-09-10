import "server-only";

import { createAppAuth } from "@octokit/auth-app";
import type { Octokit } from "@octokit/rest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { isProductionRuntime } from "@/auth-secret";

import { isE2EHarnessEnabled } from "../e2e-harness";
import {
  createOctokit,
  filterReposByQuery,
  type GitHubRepoSummary,
  mapGitHubRepo,
  normalizeGitHubFullName,
  octokitErrorMessage,
} from "./github";

/** True when a GitHub App can mint per-installation tokens. */
export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
}

/**
 * Public install URL for the GitHub App (`https://github.com/apps/<slug>/installations/new`).
 * Requires `GITHUB_APP_SLUG` (the App's URL slug, not the numeric id).
 */
export function githubAppInstallUrl(): string | undefined {
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  if (!slug) return undefined;
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

/**
 * Production with GitHub sign-in must use a GitHub App so customers never grant
 * broad OAuth scopes over their entire account.
 * Skipped under the Playwright e2e harness (local fixture, no App).
 */
export function assertProductionGitHubApp(): void {
  if (isE2EHarnessEnabled()) return;
  if (!isProductionRuntime()) return;
  if (
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_GITHUB_ID ||
    !process.env.AUTH_GITHUB_SECRET
  ) {
    return;
  }
  if (!isGitHubAppConfigured()) {
    throw new Error(
      "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required in production when GitHub auth is configured (see docs/deploy.md).",
    );
  }
}

function normalizeGitHubAppPrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

function appAuthOptions(): {
  appId: number;
  privateKey: string;
} {
  const appId = Number(process.env.GITHUB_APP_ID);
  const privateKey = normalizeGitHubAppPrivateKey(
    process.env.GITHUB_APP_PRIVATE_KEY ?? "",
  );
  if (!Number.isFinite(appId) || !privateKey) {
    throw new Error("GitHub App credentials are incomplete.");
  }
  return { appId, privateKey };
}

/** Short-lived installation token scoped to repos where the App is installed. */
export async function createInstallationAccessToken(
  installationId: number,
): Promise<string> {
  const auth = createAppAuth(appAuthOptions());
  const { token } = await auth({
    type: "installation",
    installationId,
  });
  return token;
}

async function listUserInstallationIds(octokit: Octokit): Promise<number[]> {
  const installations = await octokit.paginate(
    octokit.rest.apps.listInstallationsForAuthenticatedUser,
    { per_page: 100 },
  );
  return installations.map((installation) => installation.id);
}

async function installationHasRepo(
  octokit: Octokit,
  installationId: number,
  fullNameNormalized: string,
): Promise<boolean> {
  const repos = await octokit.paginate(
    octokit.rest.apps.listInstallationReposForAuthenticatedUser,
    { installation_id: installationId, per_page: 100 },
  );
  return repos.some(
    (repo) => normalizeGitHubFullName(repo.full_name) === fullNameNormalized,
  );
}

/**
 * Resolves a GitHub App installation id the signed-in user can access for
 * `fullName`. Never trusts a client-claimed installation id unless it appears
 * in `listInstallationsForAuthenticatedUser` and exposes that repo.
 */
export async function resolveUserInstallationForRepo(options: {
  userAccessToken: string;
  fullName: string;
  /** Optional client hint — rejected when not on the user's installations. */
  claimedInstallationId?: number;
}): Promise<number> {
  const octokit = createOctokit(options.userAccessToken);
  const target = normalizeGitHubFullName(options.fullName);

  let installationIds: number[];
  try {
    installationIds = await listUserInstallationIds(octokit);
  } catch (error) {
    throw new PublicError(
      octokitErrorMessage(error, "GitHub App installation API error"),
      "connect",
    );
  }

  if (installationIds.length === 0) {
    throw new PublicError(
      "No GitHub App installations found for your account. Install the App on the target repos first.",
      "connect",
    );
  }

  const claimed = options.claimedInstallationId;
  if (claimed != null && Number.isFinite(claimed)) {
    if (!installationIds.includes(claimed)) {
      throw new PublicError(
        "That GitHub App installation is not available on your account.",
        "connect",
      );
    }
    try {
      if (await installationHasRepo(octokit, claimed, target)) {
        return claimed;
      }
    } catch (error) {
      throw new PublicError(
        octokitErrorMessage(error, "GitHub App installation API error"),
        "connect",
      );
    }
    throw new PublicError(
      `${options.fullName.trim()} is not accessible via the selected GitHub App installation.`,
      "connect",
    );
  }

  try {
    for (const installationId of installationIds) {
      if (await installationHasRepo(octokit, installationId, target)) {
        return installationId;
      }
    }
  } catch (error) {
    throw new PublicError(
      octokitErrorMessage(error, "GitHub App installation API error"),
      "connect",
    );
  }

  throw new PublicError(
    `${options.fullName.trim()} is not available via your GitHub App installations. Install the App on that repository first.`,
    "connect",
  );
}

/**
 * Lists repositories visible via GitHub App installations for this user.
 * Requires a user-to-server token from the App's OAuth client (Auth.js).
 */
export async function listReposViaInstallations(options: {
  userAccessToken: string;
  perPage?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  const octokit = createOctokit(options.userAccessToken);
  const perPage = Math.min(options.perPage ?? 50, 100);
  const repos: GitHubRepoSummary[] = [];

  try {
    const installationIds = await listUserInstallationIds(octokit);

    for (const installationId of installationIds) {
      const installedRepos = await octokit.paginate(
        octokit.rest.apps.listInstallationReposForAuthenticatedUser,
        { installation_id: installationId, per_page: perPage },
      );
      for (const repo of installedRepos) {
        repos.push(mapGitHubRepo(repo, installationId));
      }
      if (repos.length >= perPage) break;
    }
  } catch (error) {
    throw new PublicError(
      octokitErrorMessage(error, "GitHub App installation API error"),
      "connect",
    );
  }

  return filterReposByQuery(repos, options.q).slice(0, perPage);
}
