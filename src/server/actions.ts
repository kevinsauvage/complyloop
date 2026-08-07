"use server";

import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import { applyFix } from "@/analysis/fixes";
import { resolveInside } from "@/analysis/workspace-path";
import { auth, getGitHubAccessToken, signIn, signOut } from "@/auth";
import { advanceRemediation } from "@/core/remediation";
import { isOrgRole } from "@/core/rbac";
import type {
  Dismissal,
  Finding,
  OrgRole,
  RequirementExceptionReason,
} from "@/core/types";
import {
  buildSuggestion,
  locateViolationInProject,
  mergeFix,
  refreshRequirementStatuses,
  runAssessment,
} from "./assessment";
import {
  ConnectError,
  connectGitHubRepo,
  connectProjectInput,
  disconnectGitHubRepo,
  setActiveProject,
} from "./connect";
import {
  actionErrorState,
  runActionMessage,
  type ActionMessageState,
} from "./action-state";
import { STILL_FAILING_VERIFY_MESSAGE } from "./verify-messages";
import { assertConnectProjectAllowed } from "./connect-policy";
import { addEvidence, type Db } from "./db";
import { reportWarning } from "./observability";
import { fetchGitHubRepo } from "./github";
import {
  createInstallationAccessToken,
  isGitHubAppConfigured,
} from "./github-app";
import { writeActiveOrgCookie } from "./active-org";
import { writeActiveProjectCookie } from "./active-project";
import {
  canManageOrgMembers,
  createOrganization,
  defaultOrgIdForUser,
  inviteOrgMember,
  removeOrgMember,
} from "./orgs";
import { preparePullRequest } from "./pr";
import { assertProjectPermission } from "./project-visibility";
import {
  applyFrameworkPreset,
  importChecklist,
  importCustomControl,
  setProjectScope,
} from "./requirements-intake";
import { resetSampleWorkspace } from "./seed";
import {
  controlById,
  findingById,
  getWorkspace,
  remediationForFinding,
  withWorkspaceWrite,
  type Workspace,
} from "./workspace";

export type ConnectFormState = {
  error: string | null;
};

function refresh(): void {
  revalidatePath("/", "layout");
}

function isDismissalReason(value: unknown): value is Dismissal["reason"] {
  return (
    value === "false_positive" ||
    value === "not_applicable" ||
    value === "accepted_risk"
  );
}

function replaceRemediation(db: Db, updated: ReturnType<typeof advanceRemediation>): void {
  const index = db.remediations.findIndex((candidate) => candidate.id === updated.id);
  db.remediations[index] = updated;
}

function requireOnActive(
  workspace: Workspace,
  permission: Parameters<typeof assertProjectPermission>[2],
): void {
  assertProjectPermission(workspace.project, workspace.access, permission);
}

function requireOnFindingProject(
  workspace: Workspace,
  finding: Finding,
  permission: Parameters<typeof assertProjectPermission>[2],
): void {
  const project = workspace.db.projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project) throw new Error(`Unknown project: ${finding.projectId}`);
  assertProjectPermission(project, workspace.access, permission);
}

function locateViolation(db: Db, finding: Finding) {
  const project = db.projects.find((candidate) => candidate.id === finding.projectId);
  if (!project) throw new Error(`Unknown project: ${finding.projectId}`);
  return {
    project,
    match: locateViolationInProject(project, finding),
  };
}

export async function signInWithGitHubAction(): Promise<void> {
  await signIn("github", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function runAssessmentAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      runAssessment(workspace.db, workspace.project.id);
    });
    refresh();
    return "Assessment complete.";
  });
}

export async function resetProjectAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      if (project.source !== "sample") {
        throw new Error("Only the sample project can be reset.");
      }
      resetSampleWorkspace(project);
      addEvidence(db, {
        kind: "project_reset",
        summary: `Workspace of "${project.name}" restored to its original state`,
        projectId: project.id,
      });
    });
    refresh();
    return "Sample project reset.";
  });
}

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
    if (error instanceof ConnectError) {
      return { error: error.message };
    }
    throw error;
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

export type OrgMemberFormState = {
  error: string | null;
};

export type CreateOrgFormState = {
  error: string | null;
};

export async function switchOrgAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to switch organizations.");

  const orgId = formData.get("orgId");
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new Error("An organization id is required.");
  }

  let projectIdToActivate: string | null = null;
  await withWorkspaceWrite(({ organizations, db }) => {
    if (!organizations.some((org) => org.id === orgId)) {
      throw new Error("You are not a member of that organization.");
    }
    const projectInOrg = db.projects.find((project) => project.orgId === orgId);
    if (projectInOrg) {
      projectIdToActivate = projectInOrg.id;
    }
  });
  await writeActiveOrgCookie(orgId);
  if (projectIdToActivate) {
    await writeActiveProjectCookie(projectIdToActivate);
  }
  refresh();
}

export async function createOrgAction(
  _previous: CreateOrgFormState,
  formData: FormData,
): Promise<CreateOrgFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  const githubLogin = session?.user?.login;
  if (!userId || !githubLogin) {
    return { error: "Sign in with GitHub to create an organization." };
  }

  const nameRaw = formData.get("name");
  if (typeof nameRaw !== "string" || nameRaw.trim().length === 0) {
    return { error: "Enter an organization name." };
  }

  try {
    const org = await withWorkspaceWrite((workspace) =>
      createOrganization(workspace.db, {
        name: nameRaw,
        creatorUserId: userId,
        githubLogin,
      }),
    );
    await writeActiveOrgCookie(org.id);
    refresh();
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not create organization.",
    };
  }
}

export async function inviteOrgMemberAction(
  _previous: OrgMemberFormState,
  formData: FormData,
): Promise<OrgMemberFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Sign in to manage organization members." };

  const orgIdRaw = formData.get("orgId");
  const loginRaw = formData.get("githubLogin");
  const roleRaw = formData.get("role");
  if (typeof orgIdRaw !== "string" || orgIdRaw.length === 0) {
    return { error: "Select an organization." };
  }
  if (typeof loginRaw !== "string" || loginRaw.trim().length === 0) {
    return { error: "Enter a GitHub username." };
  }
  if (!isOrgRole(roleRaw) || roleRaw === "owner") {
    return { error: "Choose a role: admin, member, or viewer." };
  }

  try {
    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can invite members.");
      }
      inviteOrgMember(db, orgIdRaw, userId, loginRaw, roleRaw as OrgRole);
    });
    refresh();
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invite failed.",
    };
  }
}

export async function removeOrgMemberAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Sign in to manage organization members.");

    const orgIdRaw = formData.get("orgId");
    const membershipId = formData.get("membershipId");
    if (typeof orgIdRaw !== "string" || orgIdRaw.length === 0) {
      throw new Error("Organization id is required.");
    }
    if (typeof membershipId !== "string" || membershipId.length === 0) {
      throw new Error("Membership id is required.");
    }

    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can remove members.");
      }
      removeOrgMember(db, orgIdRaw, userId, membershipId);
    });
    refresh();
    return "Member removed.";
  });
}

export type ConnectGitHubFormState = {
  error: string | null;
};

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
        cloneUrl: repo.cloneUrl,
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
    if (error instanceof ConnectError) {
      return { error: error.message };
    }
    throw error;
  }
}

export type DisconnectGitHubFormState = {
  error: string | null;
};

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
    if (error instanceof ConnectError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function approveRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  try {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

      const editedValue = formData.get("value");
      if (
        typeof editedValue === "string" &&
        editedValue.trim().length > 0 &&
        finding.fix?.kind === "insert_attribute" &&
        finding.fix.editable
      ) {
        finding.fix = { ...finding.fix, value: editedValue.trim() };
      }

      const project = db.projects.find(
        (candidate) => candidate.id === finding.projectId,
      );
      if (project && finding.fix) {
        remediation.suggestion = buildSuggestion(project, {
          location: finding.location,
          fix: finding.fix,
        });
      }

      replaceRemediation(
        db,
        advanceRemediation(remediation, "approved", "Approved by user"),
      );
      addEvidence(db, {
        kind: "remediation_approved",
        summary: `Remediation approved for ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: finding.fix ? { fix: { ...finding.fix } } : undefined,
      });
    });
    refresh();
    return { error: null, message: "Remediation approved." };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function applyRemediationAction(
  findingId: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  try {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      if (!finding.fix) throw new Error("This finding has no automatable fix.");

      const { project, match } = locateViolation(db, finding);
      if (!match?.fix) {
        throw new Error(
          "The violation could not be re-located in the current file.",
        );
      }
      const fix = mergeFix(finding.fix, match.fix);
      if (!fix) throw new Error("No applicable fix.");

      const absolutePath = resolveInside(
        project.rootPath,
        finding.location.filePath,
      );
      const text = fs.readFileSync(absolutePath, "utf8");
      fs.writeFileSync(absolutePath, applyFix(text, fix));

      replaceRemediation(
        db,
        advanceRemediation(
          remediation,
          "implemented",
          "Suggested change applied to the file",
        ),
      );
      addEvidence(db, {
        kind: "remediation_implemented",
        summary: `Change applied to ${finding.location.filePath}:${finding.location.line}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { fix: { ...fix } },
      });
    });
    refresh();
    return { error: null, message: "Change applied to the file." };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function verifyRemediationAction(
  findingId: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  try {
    let stillFailing = false;
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

      const { match } = locateViolation(db, finding);
      if (match) {
        stillFailing = true;
        remediation.history.push({
          status: remediation.status,
          at: new Date().toISOString(),
          note: "Verification failed: the violation is still detected at this location.",
        });
        return;
      }

      replaceRemediation(
        db,
        advanceRemediation(
          remediation,
          "verified",
          "Automated re-check found no remaining violation in the file",
        ),
      );
      finding.status = "resolved";
      finding.resolvedNote = "Fix verified by re-running the automated check.";
      addEvidence(db, {
        kind: "remediation_verified",
        summary: `Verified: ${finding.checkId} no longer fails in ${finding.location.filePath}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
      });
      refreshRequirementStatuses(db, finding.projectId);
    });
    refresh();
    if (stillFailing) {
      return {
        error: STILL_FAILING_VERIFY_MESSAGE,
        message: null,
      };
    }
    return { error: null, message: "Fix verified by automated re-check." };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function dismissFindingAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  try {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");

      const reason = formData.get("reason");
      const note = formData.get("note");
      if (!isDismissalReason(reason)) {
        throw new Error("A dismissal reason is required.");
      }

      finding.status = "dismissed";
      finding.dismissal = {
        reason,
        note: typeof note === "string" ? note.trim() : "",
        at: new Date().toISOString(),
      };
      addEvidence(db, {
        kind: "finding_dismissed",
        summary: `Finding dismissed (${reason}): ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { reason, note: finding.dismissal.note },
      });
      refreshRequirementStatuses(db, finding.projectId);
    });
    refresh();
    return { error: null, message: "Finding dismissed." };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function generateAiExplanationAction(findingId: string): Promise<void> {
  await withWorkspaceWrite(async (workspace) => {
  const { db } = workspace;
  const finding = findingById(db, findingId);
  requireOnFindingProject(workspace, finding, "project.view");
  const control = controlById(db, finding.controlId);

  const explanation = await generateAiExplanation(finding, control);
  if (explanation) {
    finding.explanations.push(explanation);
  } else {
    reportWarning("AI explanation unavailable or failed", {
      code: "ai_explanation_failed",
      findingId,
      projectId: finding.projectId,
    });
  }
  });
  refresh();
}

export async function generateAiRemediationAction(findingId: string): Promise<void> {
  await withWorkspaceWrite(async (workspace) => {
  const { db } = workspace;
  const finding = findingById(db, findingId);
  requireOnFindingProject(workspace, finding, "project.remediate");
  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, findingId);

  if (finding.status !== "open") {
    throw new Error("AI remediation is only available for open findings.");
  }
  if (remediation.status !== "detected" && remediation.status !== "suggested") {
    throw new Error(
      "AI remediation can only refine suggestions before approval.",
    );
  }

  const result = await generateAiRemediation(finding, control);
  if (!result) {
    reportWarning("AI remediation unavailable or failed", {
      code: "ai_remediation_failed",
      findingId,
      projectId: finding.projectId,
    });
    refresh();
    return;
  }

  remediation.suggestion = result.suggestion;
  if (
    result.attributeValue &&
    finding.fix?.kind === "insert_attribute" &&
    finding.fix.editable
  ) {
    finding.fix = { ...finding.fix, value: result.attributeValue };
  }

  if (remediation.status === "detected") {
    replaceRemediation(
      db,
      advanceRemediation(
        remediation,
        "suggested",
        `AI suggestion: ${result.suggestion.description}`,
      ),
    );
  } else {
    remediation.history.push({
      status: "suggested",
      at: new Date().toISOString(),
      note: `AI suggestion refreshed: ${result.suggestion.description}`,
    });
  }

  addEvidence(db, {
    kind: "ai_remediation_suggested",
    summary: `AI remediation suggested for ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: {
      provenance: "ai",
      model: result.suggestion.model,
      confidence: result.suggestion.confidence,
      description: result.suggestion.description,
    },
  });
  });
  refresh();
}

/**
 * Marks an approved remediation as implemented when the engineer applied the
 * change outside ComplyLoop (or there is no automatable fix).
 */
export async function markRemediationImplementedAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  try {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const noteRaw = formData.get("note");
      const note =
        typeof noteRaw === "string" && noteRaw.trim().length > 0
          ? noteRaw.trim()
          : "Marked implemented by user (applied outside the platform)";

      replaceRemediation(
        db,
        advanceRemediation(remediation, "implemented", note),
      );
      addEvidence(db, {
        kind: "remediation_implemented",
        summary: `Remediation marked implemented for ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { manual: true, note },
      });
    });
    refresh();
    return { error: null, message: "Marked as implemented." };
  } catch (error) {
    return actionErrorState(error);
  }
}

/**
 * Human verification path when automated re-check is unavailable or the user
 * has verified the fix by other means. Still requires an explicit note.
 */
export async function manualVerifyRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  try {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const noteRaw = formData.get("note");
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new Error(
          "A verification note is required for manual verification.",
        );
      }
      const note = noteRaw.trim();

      if (remediation.status !== "implemented") {
        throw new Error("Manual verification requires status implemented.");
      }

      replaceRemediation(
        db,
        advanceRemediation(
          remediation,
          "verified",
          `Manual verification: ${note}`,
        ),
      );
      finding.status = "resolved";
      finding.resolvedNote = `Manually verified by human review: ${note}`;
      addEvidence(db, {
        kind: "remediation_manually_verified",
        summary: `Manually verified ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { note, determination: "human_review" },
      });
      refreshRequirementStatuses(db, finding.projectId);
    });
    refresh();
    return { error: null, message: "Manually verified." };
  } catch (error) {
    return actionErrorState(error);
  }
}

function isRequirementExceptionReason(
  value: unknown,
): value is RequirementExceptionReason {
  return (
    value === "not_applicable" ||
    value === "accepted_risk" ||
    value === "compensating_control" ||
    value === "temporary"
  );
}
export async function markRequirementExceptionAction(
  requirementId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }

      const reason = formData.get("reason");
      const noteRaw = formData.get("note");
      const expiresRaw = formData.get("expiresAt");
      if (!isRequirementExceptionReason(reason)) {
        throw new Error("A valid exception reason is required.");
      }
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new Error(
          "A note is required when setting a requirement exception.",
        );
      }
      if (reason === "temporary") {
        if (typeof expiresRaw !== "string" || expiresRaw.trim().length === 0) {
          throw new Error("Temporary exceptions require an expiry date.");
        }
      }

      const note = noteRaw.trim();
      const previous = requirement.status;
      const expiresAt =
        reason === "temporary" && typeof expiresRaw === "string"
          ? new Date(expiresRaw).toISOString()
          : undefined;

      requirement.exception = {
        reason,
        note,
        at: new Date().toISOString(),
        expiresAt,
      };
      delete requirement.humanPass;
      requirement.determination = "human_review";
      if (reason === "not_applicable") {
        requirement.status = "not_applicable";
      }
      requirement.updatedAt = new Date().toISOString();

      const control = controlById(db, requirement.controlId);
      addEvidence(db, {
        kind: "requirement_exception_set",
        summary: `${control.code} exception (${reason}): ${note}${expiresAt ? ` (expires ${expiresAt})` : ""}`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: {
          reason,
          note,
          expiresAt,
          from: previous,
          to: requirement.status,
        },
      });
      if (previous !== requirement.status) {
        addEvidence(db, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → ${requirement.status} — human exception`,
          projectId: project.id,
          controlId: requirement.controlId,
          detail: { from: previous, to: requirement.status, regression: false },
        });
      }
    });
    refresh();
    return "Exception recorded.";
  });
}

export async function markRequirementPassedAction(
  requirementId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }

      const control = controlById(db, requirement.controlId);
      if (control.checkId !== null) {
        throw new Error(
          "Only manual controls (no automated check) can be marked passed by human review.",
        );
      }

      const noteRaw = formData.get("note");
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new Error("A note is required when marking a requirement passed.");
      }
      const note = noteRaw.trim();
      const previous = requirement.status;

      delete requirement.exception;
      requirement.humanPass = {
        note,
        at: new Date().toISOString(),
      };
      requirement.status = "passed";
      requirement.determination = "human_review";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_human_passed",
        summary: `${control.code} marked passed (human review): ${note}`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { note, from: previous, to: "passed" },
      });
      if (previous !== "passed") {
        addEvidence(db, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → passed — human review`,
          projectId: project.id,
          controlId: requirement.controlId,
          detail: {
            from: previous,
            to: "passed",
            regression: false,
            humanPass: true,
          },
        });
      }
    });
    refresh();
    return "Human pass recorded.";
  });
}

export async function clearRequirementHumanPassAction(
  requirementId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }
      if (!requirement.humanPass) {
        throw new Error("This requirement has no human pass to clear.");
      }

      const control = controlById(db, requirement.controlId);
      const previousPass = requirement.humanPass;
      delete requirement.humanPass;
      requirement.determination = "automated";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_human_pass_cleared",
        summary: `${control.code} human pass cleared`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { previousPass },
      });

      refreshRequirementStatuses(db, project.id);
    });
    refresh();
    return "Human pass cleared.";
  });
}

export async function updateRequirementScopeAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      const selected = formData
        .getAll("controlId")
        .filter((value): value is string => typeof value === "string");
      setProjectScope(db, project, selected);
    });
    refresh();
    return "Scope saved.";
  });
}

export async function importCustomControlAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      const code = formData.get("code");
      const title = formData.get("title");
      const description = formData.get("description");
      const secondaryCode = formData.get("secondaryCode");
      if (
        typeof code !== "string" ||
        typeof title !== "string" ||
        typeof description !== "string"
      ) {
        throw new Error("Code, title, and description are required.");
      }
      importCustomControl(db, project, {
        code,
        title,
        description,
        secondaryCode:
          typeof secondaryCode === "string" ? secondaryCode : undefined,
      });
    });
    refresh();
    return "Control imported.";
  });
}

export async function applyFrameworkPresetAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const presetId = formData.get("presetId");
    if (typeof presetId !== "string" || presetId.length === 0) {
      throw new Error("A framework preset is required.");
    }
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      applyFrameworkPreset(db, project, presetId);
    });
    refresh();
    return "Preset applied.";
  });
}

export async function importChecklistAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const checklist = formData.get("checklist");
    if (typeof checklist !== "string" || checklist.trim().length === 0) {
      throw new Error("Paste a checklist to import.");
    }
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      importChecklist(db, project, checklist);
    });
    refresh();
    return "Checklist imported.";
  });
}

export async function markAlertReadAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const alertId = formData.get("alertId");
    if (typeof alertId !== "string" || alertId.length === 0) {
      throw new Error("Unknown alert.");
    }
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.view");
      const { db, project } = workspace;
      const alert = db.alerts.find(
        (candidate) =>
          candidate.id === alertId && candidate.projectId === project.id,
      );
      if (!alert) throw new Error("Unknown alert.");
      alert.read = true;
    });
    refresh();
    return "Alert dismissed.";
  });
}

export type CreatePrFormState = {
  error: string | null;
  message: string | null;
  prUrl: string | null;
};

export async function createPullRequestAction(
  findingId: string,
  previous: CreatePrFormState,
  formData: FormData,
): Promise<CreatePrFormState> {
  void previous;
  void formData;
  const preview = await getWorkspace();
  const finding = findingById(preview.db, findingId);
  try {
    requireOnFindingProject(preview, finding, "project.remediate");
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Not allowed.",
      message: null,
      prUrl: null,
    };
  }
  const control = controlById(preview.db, finding.controlId);
  const remediation = remediationForFinding(preview.db, findingId);
  const project = preview.db.projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project) {
    return { error: "Unknown project.", message: null, prUrl: null };
  }

  try {
    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
    );
    await withWorkspaceWrite(({ db }) => {
      const liveFinding = findingById(db, findingId);
      addEvidence(db, {
        kind: "pull_request_prepared",
        summary: result.prUrl
          ? `Pull request prepared for ${liveFinding.checkId}: ${result.prUrl}`
          : `Branch ${result.branch} prepared for ${liveFinding.checkId}`,
        projectId: project.id,
        controlId: liveFinding.controlId,
        findingId: liveFinding.id,
        detail: {
          branch: result.branch,
          prUrl: result.prUrl,
          title: result.title,
        },
      });
    });
    refresh();
    return {
      error: null,
      message: result.message,
      prUrl: result.prUrl,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to prepare PR.",
      message: null,
      prUrl: null,
    };
  }
}

export async function clearRequirementExceptionAction(
  requirementId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }
      if (!requirement.exception) {
        throw new Error("This requirement has no exception to clear.");
      }

      const control = controlById(db, requirement.controlId);
      const previousException = requirement.exception;
      delete requirement.exception;
      requirement.determination = "automated";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_exception_cleared",
        summary: `${control.code} exception cleared (was ${previousException.reason})`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { previousException },
      });

      // Re-derive status from current open findings now that the exception is gone.
      refreshRequirementStatuses(db, project.id);
    });
    refresh();
    return "Exception cleared.";
  });
}
