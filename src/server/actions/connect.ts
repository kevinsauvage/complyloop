"use server";

import { z } from "zod";
import { auth, getGitHubAccessToken } from "@/auth";
import { requiredField } from "@/core/boundary";
import {
  actionErrorState,
  formError,
  formSuccess,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseFormState } from "../boundary";
import { PublicError } from "@complyloop/db/types";
import {
  readActiveOrgCookie,
  writeActiveProjectCookie,
} from "../active-cookies";
import {
  connectGitHubRepo,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "../connect-github";
import { getDrizzle } from "@complyloop/db/client";
import { insertEvidenceRecords } from "@complyloop/db/repo/evidence";
import { deleteProject, insertProject } from "@complyloop/db/repo/projects";
import { loadWorkspaceDb } from "@complyloop/db/workspace-load";
import { fetchGitHubRepo } from "../github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
  resolveUserInstallationForRepo,
} from "../github-app";
import { accessFromStore, setActiveProject } from "../project-visibility";
import { projectCapabilities } from "../project-capabilities";
import { assertConnectRateLimit } from "../rate-limit";
import { resolveActiveOrgId } from "../orgs";
import { getWorkspace, ensurePersonalOrgProvisioned } from "../workspace";
import { refresh } from "./shared";

export type ConnectGitHubFormState = ActionMessageState;
export type DisconnectGitHubFormState = ActionMessageState;

const switchProjectInput = z.object({
  projectId: requiredField("A project id is required."),
});

const connectGitHubRepoInput = z.object({
  fullName: requiredField("Select a GitHub repository.", 256),
  installationId: z
    .string()
    .optional()
    .transform((raw) => {
      if (raw == null || raw.trim() === "") return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    }),
});

const disconnectGitHubRepoInput = z.object({
  projectId: requiredField("Select a connected project to disconnect."),
});

export async function switchProjectAction(formData: FormData): Promise<void> {
  const { projectId } = parseForm(switchProjectInput, formData);
  const workspace = await getWorkspace();
  setActiveProject(workspace.db, projectId, workspace.userId);
  await writeActiveProjectCookie(projectId);
  refresh();
}

export async function connectGitHubRepoAction(
  _previous: ConnectGitHubFormState,
  formData: FormData,
): Promise<ConnectGitHubFormState> {
  const parsed = parseFormState(connectGitHubRepoInput, formData);
  if (!parsed.ok) return parsed.state;
  const fullName = parsed.data.fullName;
  const claimedInstallationId = parsed.data.installationId;

  const session = await auth();
  const userId = session?.user?.id;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) {
    return formError("Sign in with GitHub to connect a repository.");
  }

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
        claimedInstallationId,
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
      if (!orgId || !projectCapabilities(null, access, orgId).canConnect) {
        throw new PublicError(
          "You need admin or owner access in the active organization to connect a project.",
          "connect",
        );
      }
      const alreadyConnected = findConnectedGitHubProject(
        db.projects,
        fullName,
        orgId,
      );
      if (alreadyConnected) {
        throw new PublicError(
          `${fullName} is already connected. Disconnect it first.`,
          "connect",
        );
      }
      const { project, evidence } = await connectGitHubRepo(db, {
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
      await insertEvidenceRecords(tx, evidence);
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
  const parsed = parseFormState(disconnectGitHubRepoInput, formData);
  if (!parsed.ok) return parsed.state;
  const { projectId } = parsed.data;

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
        activeProjectId: projectId,
        evidenceLimit: 0,
      });
      const project = db.projects.find(
        (candidate: (typeof db.projects)[number]) => candidate.id === projectId,
      );
      disconnectedName = project?.github?.fullName ?? project?.name ?? "repository";
      const { deleteProjectId, evidence, nextProjectId: next } = disconnectGitHubRepo(
        db,
        projectId,
        userId,
      );
      nextProjectId = next;
      await deleteProject(tx, deleteProjectId);
      await insertEvidenceRecords(tx, [evidence]);
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
