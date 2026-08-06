import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { isProductionRuntime } from "@/auth-secret";
import { ConnectError } from "./connect";
import type { GitHubRepoSummary } from "./github";
import { octokitErrorMessage } from "./octokit";

function mapRepo(
  repo: {
    full_name: string;
    name: string;
    description: string | null;
    private: boolean;
    default_branch?: string | null;
    updated_at?: string | null;
    html_url: string;
    clone_url: string;
  },
  installationId: number,
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
    installationId,
  };
}

/** True when a GitHub App can mint per-installation tokens. */
export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
}

/**
 * OAuth scopes for Auth.js. With a GitHub App configured, identity-only scopes
 * suffice — repo access comes from installation tokens on selected repos.
 */
export function githubAuthorizationScopes(): string {
  return isGitHubAppConfigured()
    ? "read:user user:email"
    : "read:user user:email repo";
}

/**
 * Production with GitHub sign-in must use a GitHub App so customers never grant
 * the classic `repo` scope over their entire account.
 */
export function assertProductionGitHubApp(): void {
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

export function normalizeGitHubAppPrivateKey(raw: string): string {
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

/**
 * Lists repositories visible via GitHub App installations for this user.
 * Requires a user-to-server token from the App's OAuth client (Auth.js).
 */
export async function listReposViaInstallations(options: {
  userAccessToken: string;
  perPage?: number;
  q?: string;
}): Promise<GitHubRepoSummary[]> {
  const octokit = new Octokit({ auth: options.userAccessToken });
  const perPage = Math.min(options.perPage ?? 50, 100);
  const repos: GitHubRepoSummary[] = [];

  try {
    const installations = await octokit.paginate(
      octokit.rest.apps.listInstallationsForAuthenticatedUser,
      { per_page: 100 },
    );

    for (const installation of installations) {
      const installationId = installation.id;
      const installedRepos = await octokit.paginate(
        octokit.rest.apps.listInstallationReposForAuthenticatedUser,
        { installation_id: installationId, per_page: perPage },
      );
      for (const repo of installedRepos) {
        repos.push(mapRepo(repo, installationId));
      }
      if (repos.length >= perPage) break;
    }
  } catch (error) {
    throw new ConnectError(
      octokitErrorMessage(error, "GitHub App installation API error"),
    );
  }

  const q = options.q?.trim().toLowerCase();
  const filtered = q
    ? repos.filter(
        (repo) =>
          repo.fullName.toLowerCase().includes(q) ||
          (repo.description?.toLowerCase().includes(q) ?? false),
      )
    : repos;

  return filtered.slice(0, perPage);
}
