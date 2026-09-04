"use server";

import { auth, getGitHubAccessToken } from "@/auth";
import {
  actionErrorState,
  formError,
  formSuccess,
  readFormString,
  requireFormString,
  type ActionMessageState,
} from "../action-state";
import {
  readActiveOrgCookie,
  writeActiveProjectCookie,
} from "../active-cookies";
import { ConnectError } from "../connect-error";
import { setActiveProject } from "../connect-active";
import {
  connectGitHubRepo,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "../connect-github";
import { userCanConnectProjects } from "../connect-policy";
import { getDrizzle } from "../db-store/client";
import { insertEvidence } from "../db-store/repo/evidence";
import { deleteProject, insertProject } from "../db-store/repo/projects";
import { loadWorkspaceDb } from "../db-store/workspace-load";
import { fetchGitHubRepo } from "../github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
  resolveUserInstallationForRepo,
} from "../github-app";
import { accessFromStore } from "../project-visibility";
import { assertConnectRateLimit } from "../rate-limit";
import { resolveActiveOrgId } from "../orgs";
import { getWorkspace, ensurePersonalOrgProvisioned } from "../workspace";
import { refresh } from "./shared";

export type ConnectGitHubFormState = ActionMessageState;
export type DisconnectGitHubFormState = ActionMessageState;

export async function switchProjectAction(formData: FormData): Promise<void> {
  const projectId = requireFormString(
    formData,
    "projectId",
    "A project id is required.",
  );
  const workspace = await getWorkspace();
  setActiveProject(workspace.db, projectId, workspace.userId);
  await writeActiveProjectCookie(projectId);
  refresh();
}

export async function connectGitHubRepoAction(
  _previous: ConnectGitHubFormState,
  formData: FormData,
): Promise<ConnectGitHubFormState> {
  const fullNameRaw = readFormString(formData, "fullName");
  if (fullNameRaw == null || fullNameRaw.trim().length === 0) {
    return formError("Select a GitHub repository.");
  }
  const fullName = fullNameRaw.trim();

  const session = await auth();
  const userId = session?.user?.id;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) {
    return formError("Sign in with GitHub to connect a repository.");
  }

  const installationIdRaw = readFormString(formData, "installationId");
  const claimedInstallationId =
    installationIdRaw != null ? Number(installationIdRaw) : undefined;

  try {
    await assertConnectRateLimit(userId);
    const userAccessToken = await getGitHubAccessToken();
    if (!userAccessToken) {
      return formError(
        "GitHub access token missing. Sign out and sign in again to grant repo access.",
      );
    }

    let accessToken = userAccessToken;
    let installationId: number | undefined;

    if (isGitHubAppConfigured()) {
      installationId = await resolveUserInstallationForRepo({
        userAccessToken,
        fullName,
        claimedInstallationId:
          claimedInstallationId != null && Number.isFinite(claimedInstallationId)
            ? claimedInstallationId
            : undefined,
      });
      accessToken = await createInstallationAccessToken(installationId);
    }

    const repo = await fetchGitHubRepo(accessToken, fullName);
    await ensurePersonalOrgProvisioned(userId, githubLogin ?? "");
    const preferredOrgId = await readActiveOrgCookie();
    let connectedProjectId: string | null = null;

    const drizzle = await getDrizzle();
    await drizzle.transaction(async (tx) => {
      const db = await loadWorkspaceDb(tx, {
        userId,
        githubLogin,
        activeProjectId: null,
        evidenceLimit: 0,
      });
      const orgId =
        resolveActiveOrgId(db, userId, preferredOrgId) ??
        db.organizations[0]?.id ??
        null;
      const access = accessFromStore(db, userId, githubLogin);
      if (!orgId || !userCanConnectProjects(access.memberships, userId, orgId)) {
        throw new ConnectError(
          "You need admin or owner access in the active organization to connect a project.",
        );
      }
      const alreadyConnected = findConnectedGitHubProject(
        db.projects,
        fullName,
        orgId,
      );
      if (alreadyConnected) {
        throw new ConnectError(
          `${fullName} is already connected. Disconnect it first.`,
        );
      }
      const evidenceStart = db.evidence.length;
      const project = await connectGitHubRepo(db, {
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        private: repo.private,
        ownerUserId: userId,
        orgId,
        accessToken,
        installationId,
      });
      connectedProjectId = project.id;
      await insertProject(tx, project);
      for (const record of db.evidence.slice(evidenceStart)) {
        await insertEvidence(tx, record);
      }
    });

    if (connectedProjectId) {
      await writeActiveProjectCookie(connectedProjectId);
    }
    refresh();
    return formSuccess(`Connected ${repo.fullName}.`);
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function disconnectGitHubRepoAction(
  _previous: DisconnectGitHubFormState,
  formData: FormData,
): Promise<DisconnectGitHubFormState> {
  const projectIdRaw = readFormString(formData, "projectId");
  if (projectIdRaw == null) {
    return formError("Select a connected project to disconnect.");
  }

  const session = await auth();
  const userId = session?.user?.id;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) {
    return formError("Sign in with GitHub to disconnect a repository.");
  }

  try {
    let nextProjectId: string | null = null;
    let disconnectedName = "repository";
    const drizzle = await getDrizzle();
    await drizzle.transaction(async (tx) => {
      const db = await loadWorkspaceDb(tx, {
        userId,
        githubLogin,
        activeProjectId: projectIdRaw,
        evidenceLimit: 0,
      });
      const project = db.projects.find(
        (candidate: (typeof db.projects)[number]) => candidate.id === projectIdRaw,
      );
      disconnectedName = project?.github?.fullName ?? project?.name ?? "repository";
      const evidenceStart = db.evidence.length;
      nextProjectId = disconnectGitHubRepo(db, projectIdRaw, userId);
      await deleteProject(tx, projectIdRaw);
      for (const record of db.evidence.slice(evidenceStart)) {
        await insertEvidence(tx, record);
      }
    });
    if (nextProjectId) {
      await writeActiveProjectCookie(nextProjectId);
    }
    refresh();
    return formSuccess(`Disconnected ${disconnectedName}.`);
  } catch (error) {
    return actionErrorState(error);
  }
}
