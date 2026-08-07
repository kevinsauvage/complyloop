"use server";

import { auth, getGitHubAccessToken } from "@/auth";
import {
  connectFormError,
  type FormErrorState,
} from "../action-state";
import { writeActiveProjectCookie } from "../active-project";
import { assertConnectProjectAllowed } from "../connect-policy";
import { ConnectError } from "../connect-url";
import { setActiveProject } from "../connect-active";
import { connectGitHubRepo, disconnectGitHubRepo } from "../connect-github";
import { connectProjectInput } from "../connect-local";
import { fetchGitHubRepo } from "../github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "../github-app";
import { defaultOrgIdForUser } from "../orgs";
import { withWorkspaceWrite } from "../workspace";
import { refresh } from "./shared";

export type ConnectFormState = FormErrorState;
export type ConnectGitHubFormState = FormErrorState;
export type DisconnectGitHubFormState = FormErrorState;

export async function connectProjectAction(
  _previous: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const input = formData.get("target");
  if (typeof input !== "string") {
    return { error: "Enter a local path or a git repository URL." };
  }

  try {
    await withWorkspaceWrite(async (workspace) => {
      assertConnectProjectAllowed({
        userId: workspace.userId,
        activeOrgId: workspace.activeOrgId,
        memberships: workspace.db.memberships,
        target: input,
      });
      const project = await connectProjectInput(workspace.db, input);
      if (workspace.userId) {
        project.ownerUserId = workspace.userId;
        project.orgId =
          workspace.activeOrgId ??
          defaultOrgIdForUser(workspace.db, workspace.userId);
      }
      await writeActiveProjectCookie(project.id);
    });
    refresh();
    return { error: null };
  } catch (error) {
    return connectFormError(error);
  }
}

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
    await withWorkspaceWrite(async ({ db, activeOrgId }) => {
      const orgId = activeOrgId;
      const alreadyConnected = db.projects.some(
        (project) =>
          project.source === "github" &&
          (project.orgId === orgId || project.ownerUserId === userId) &&
          project.github?.fullName === fullName,
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
        orgId: orgId ?? undefined,
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
