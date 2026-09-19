"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";
import { getGitHubAccessTokenState } from "@/server/github/access-token";

import { runAction } from "../action-state";
import {
  createInstallationAccessToken,
  resolveUserInstallationForRepo,
} from "../github/github-app";
import { fetchRepo } from "../github/github-connector";
import { reportEvent } from "../observability";
import { assertConnectRateLimit } from "../rate-limit";
import {
  clearActiveProjectCookie,
  readActiveOrgCookie,
  writeActiveProjectCookie,
} from "../workspace/active-cookies";
import {
  connectGitHubRepo,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "../workspace/connect-github";
import { resolveActiveOrgId } from "../workspace/org-queries";
import { ensurePersonalOrgProvisioned } from "../workspace/personal-org";
import { projectCapabilities } from "../workspace/project-capabilities";
import {
  accessFromStore,
  setActiveProject,
} from "../workspace/project-visibility";
import { getWorkspace } from "../workspace/workspace";
import { withConnectWrite } from "../workspace/workspace-write";
import { refresh, requireSignedIn } from "./shared";

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
  setActiveProject(
    {
      projects: workspace.projects,
      organizations: workspace.organizations,
      memberships: workspace.access.memberships,
    },
    projectId,
    workspace.userId,
  );
  await writeActiveProjectCookie(projectId);
  refresh();
}

export async function connectGitHubRepoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { fullName, installationId: claimedInstallationId } = parseForm(
      connectGitHubRepoInput,
      formData,
    );
    const { userId, githubLogin } = await requireSignedIn(
      "Sign in with GitHub to connect a repository.",
    );

    await assertConnectRateLimit(userId);
    const tokenState = await getGitHubAccessTokenState();
    if (tokenState.state === "revoked") {
      throw new PublicError(
        "GitHub revoked this app's authorization. Sign out and sign in again to reconnect.",
      );
    }
    if (tokenState.state !== "valid") {
      throw new PublicError(
        "GitHub access token missing. Sign out and sign in again to grant repo access.",
      );
    }
    const userAccessToken = tokenState.token;

    const installationId = await resolveUserInstallationForRepo({
      userAccessToken,
      fullName,
      claimedInstallationId,
    });
    const accessToken = await createInstallationAccessToken(installationId);

    const repo = await fetchRepo(accessToken, fullName);
    await ensurePersonalOrgProvisioned(userId, githubLogin ?? "");
    const preferredOrgId = await readActiveOrgCookie();

    const connectedProjectId = await withConnectWrite(
      { activeProjectId: null },
      async ({ db }) => {
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
        return {
          result: project.id,
          insertProjects: [project],
          evidence,
        };
      },
    );

    await writeActiveProjectCookie(connectedProjectId);
    reportEvent("github repository connected", {
      code: "github_repo_connected",
      projectId: connectedProjectId,
      fullName: repo.fullName,
      userId,
    });
    refresh();
    return `Connected ${repo.fullName}.`;
  });
}

export async function disconnectGitHubRepoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId } = parseForm(disconnectGitHubRepoInput, formData);
    await requireSignedIn("Sign in with GitHub to disconnect a repository.");

    const { nextProjectId, disconnectedName } = await withConnectWrite(
      { activeProjectId: projectId },
      async ({ db, userId }) => {
        const project = db.projects.find(
          (candidate) => candidate.id === projectId,
        );
        const disconnectedName =
          project?.github?.fullName ?? project?.name ?? "repository";
        const { deleteProjectId, evidence, nextProjectId } =
          disconnectGitHubRepo(db, projectId, userId);
        return {
          result: { nextProjectId, disconnectedName },
          deleteProjectIds: [deleteProjectId],
          evidence: [evidence],
        };
      },
    );

    if (nextProjectId) {
      await writeActiveProjectCookie(nextProjectId);
    } else {
      await clearActiveProjectCookie();
    }
    refresh();
    return `Disconnected ${disconnectedName}.`;
  });
}
