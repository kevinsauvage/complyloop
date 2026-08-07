"use server";

import { auth, getGitHubAccessToken } from "@/auth";
import {
  connectFormError,
  type FormErrorState,
} from "../action-state";
import { writeActiveProjectCookie } from "../active-project";
import { ConnectError } from "../connect-url";
import { setActiveProject } from "../connect-active";
import {
  connectGitHubRepo,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "../connect-github";
import { userCanConnectProjects } from "../connect-policy";
import { fetchGitHubRepo } from "../github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "../github-app";
import { withWorkspaceWrite } from "../workspace";
import { refresh } from "./shared";

export type ConnectGitHubFormState = FormErrorState;
export type DisconnectGitHubFormState = FormErrorState;

export async function switchProjectAction(formData: FormData): Promise<void> {
  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("A project id is required.");
  }
  await withWorkspaceWrite(({ db, userId }) => {
    setActiveProject(db, projectId, userId);
  });
  await writeActiveProjectCookie(projectId);
  refresh();
}

export async function connectGitHubRepoAction(
  _previous: ConnectGitHubFormState,
  formData: FormData,
): Promise<ConnectGitHubFormState> {
  const fullNameRaw = formData.get("fullName");
  if (typeof fullNameRaw !== "string" || fullNameRaw.trim().length === 0) {
    return { error: "Select a GitHub repository." };
  }
  const fullName = fullNameRaw.trim();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Sign in with GitHub to connect a repository." };
  }

  const installationIdRaw = formData.get("installationId");
  const installationId =
    typeof installationIdRaw === "string" && installationIdRaw.length > 0
      ? Number(installationIdRaw)
      : undefined;

  try {
    const resolvedInstallationId =
      installationId != null && Number.isFinite(installationId)
        ? installationId
        : undefined;

    let accessToken: string | null = null;
    if (isGitHubAppConfigured()) {
      if (resolvedInstallationId == null) {
        return {
          error:
            "Select a repository from a GitHub App installation (install the App on the target repos first).",
        };
      }
      accessToken = await createInstallationAccessToken(resolvedInstallationId);
    } else {
      accessToken = await getGitHubAccessToken();
    }

    if (!accessToken) {
      return {
        error:
          "GitHub access token missing. Sign out and sign in again to grant repo access.",
      };
    }

    const repo = await fetchGitHubRepo(accessToken, fullName);
    await withWorkspaceWrite(async ({ db, activeOrgId, access }) => {
      if (
        !userCanConnectProjects(access.memberships, userId, activeOrgId)
      ) {
        throw new ConnectError(
          "You need admin or owner access in the active organization to connect a project.",
        );
      }
      const alreadyConnected = findConnectedGitHubProject(
        db.projects,
        fullName,
        userId,
        activeOrgId,
      );
      if (alreadyConnected) {
        throw new ConnectError(
          `${fullName} is already connected. Disconnect it first.`,
        );
      }
      const project = await connectGitHubRepo(db, {
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        private: repo.private,
        ownerUserId: userId,
        orgId: activeOrgId ?? undefined,
        accessToken,
        installationId: resolvedInstallationId,
      });
      await writeActiveProjectCookie(project.id);
    });
    refresh();
    return { error: null };
  } catch (error) {
    return connectFormError(error);
  }
}

export async function disconnectGitHubRepoAction(
  _previous: DisconnectGitHubFormState,
  formData: FormData,
): Promise<DisconnectGitHubFormState> {
  const projectIdRaw = formData.get("projectId");
  if (typeof projectIdRaw !== "string" || projectIdRaw.length === 0) {
    return { error: "Select a connected project to disconnect." };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Sign in with GitHub to disconnect a repository." };
  }

  try {
    let nextProjectId: string | null = null;
    await withWorkspaceWrite((workspace) => {
      disconnectGitHubRepo(workspace.db, projectIdRaw, userId);
      nextProjectId = workspace.db.activeProjectId;
    });
    if (nextProjectId) {
      await writeActiveProjectCookie(nextProjectId);
    }
    refresh();
    return { error: null };
  } catch (error) {
    return connectFormError(error);
  }
}
