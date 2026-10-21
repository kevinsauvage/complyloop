"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";
import { projectPath } from "@/core/routes";
import { getGitHubAccessTokenState } from "@/server/github/access-token";

import { runAction } from "../action-state";
import {
  createInstallationAccessToken,
  fetchRepo,
  resolveUserInstallationForRepo,
} from "../github/github-connector";
import { reportEvent } from "../observability";
import { assertConnectRateLimit } from "../rate-limit";
import { readActiveOrgCookie } from "../workspace/active-cookies";
import {
  assertGitHubRepoAssessable,
  connectGitHubRepo,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "../workspace/connect-github";
import { resolveActiveOrgId } from "../workspace/org-queries";
import { ensurePersonalOrgProvisioned } from "../workspace/personal-org";
import { projectCapabilities } from "../workspace/project-capabilities";
import { accessFromStore } from "../workspace/project-visibility";
import { withConnectWrite } from "../workspace/workspace-write";
import { refresh, requireSignedIn } from "./shared";

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

    // Permission check runs on the *user's* token, not the installation
    // token: `repos.get` with an App installation token reports the App's
    // permissions, which says nothing about what this human may do. Without
    // this, a read-only collaborator could have the App open branches for them.
    const repo = await fetchRepo(userAccessToken, fullName);
    if (!repo.canPush) {
      throw new PublicError(
        `You need write access to ${repo.fullName} to connect it: ComplyLoop opens fix branches and pull requests with the App installation token.`,
        "connect",
      );
    }
    const accessToken = await createInstallationAccessToken(installationId);

    // Validate (ephemeral clone) before taking the org write lock: the clone is
    // the slow part and must not pin a pool connection + advisory lock.
    await assertGitHubRepoAssessable({ fullName, accessToken });

    await ensurePersonalOrgProvisioned(userId, githubLogin ?? "");
    const preferredOrgId = await readActiveOrgCookie();

    const connectedProjectId = await withConnectWrite(async ({ db }) => {
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
    });

    reportEvent("github repository connected", {
      code: "github_repo_connected",
      projectId: connectedProjectId,
      fullName: repo.fullName,
      userId,
    });
    refresh();
    return {
      message: `Connected ${repo.fullName}.`,
      redirectTo: projectPath(connectedProjectId, "dashboard"),
    };
  });
}

export async function disconnectGitHubRepoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId } = parseForm(disconnectGitHubRepoInput, formData);
    await requireSignedIn("Sign in with GitHub to disconnect a repository.");

    const { disconnectedName } = await withConnectWrite(
      async ({ db, userId }) => {
        const project = db.projects.find(
          (candidate) => candidate.id === projectId,
        );
        const disconnectedName =
          project?.github?.fullName ?? project?.name ?? "repository";
        const { deleteProjectId, evidence } = disconnectGitHubRepo(
          db,
          projectId,
          userId,
        );
        return {
          result: { disconnectedName },
          deleteProjectIds: [deleteProjectId],
          evidence: [evidence],
        };
      },
    );

    refresh();
    return `Disconnected ${disconnectedName}.`;
  });
}
