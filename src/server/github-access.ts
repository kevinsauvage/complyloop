import type { Project } from "@/core/project-types";
import { getStoredGitHubToken } from "./github-tokens";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "./github-app";

export interface ResolveProjectGitHubTokenOptions {
  /**
   * Signed-in user id. Used when the project owner row has no stored token
   * (e.g. Auth.js previously minted a new UUID per sign-in).
   */
  sessionUserId?: string | null;
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

  if (
    options.sessionUserId &&
    options.sessionUserId !== project.ownerUserId
  ) {
    return getStoredGitHubToken(options.sessionUserId);
  }

  return null;
}
