import type { Project } from "@/core/project-types";
import { getStoredGitHubToken } from "./github-tokens";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "./github-app";

/**
 * Token for clone / PR / Checks against a connected GitHub project.
 * Prefers a GitHub App installation token when the project was connected
 * under an App install (least privilege, selected repos only).
 */
export async function resolveProjectGitHubToken(
  project: Project,
): Promise<string | null> {
  const installationId = project.github?.installationId;
  if (
    installationId != null &&
    Number.isFinite(installationId) &&
    isGitHubAppConfigured()
  ) {
    return createInstallationAccessToken(installationId);
  }
  if (!project.ownerUserId) return null;
  return getStoredGitHubToken(project.ownerUserId);
}
