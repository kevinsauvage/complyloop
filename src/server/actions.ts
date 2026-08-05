"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import { applyFix } from "@/analysis/fixes";
import { scanFile } from "@/analysis/scan";
import { auth, getGitHubAccessToken } from "@/auth";
import { advanceRemediation } from "@/core/remediation";
import type {
  Dismissal,
  Finding,
  RequirementExceptionReason,
} from "@/core/types";
import {
  buildSuggestion,
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
import { addEvidence, saveDb, type Db } from "./db";
import { fetchGitHubRepo } from "./github";
import { preparePullRequest } from "./pr";
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

/**
 * Re-scans the finding's file and re-locates this specific violation instance
 * (by snippet, falling back to line), so fixes and verification work on
 * current character offsets even after the file changed. Warnings are ignored:
 * they carry no fix and are not what a remediation verifies.
 */
function locateViolation(db: Db, finding: Finding) {
  const project = db.projects.find((candidate) => candidate.id === finding.projectId);
  if (!project) throw new Error(`Unknown project: ${finding.projectId}`);
  const violations = scanFile(project.rootPath, finding.location.filePath).filter(
    (candidate) =>
      candidate.checkId === finding.checkId && candidate.kind === "violation",
  );
  return {
    project,
    match: violations.find(
      (candidate) =>
        candidate.location.snippet === finding.location.snippet ||
        candidate.location.line === finding.location.line,
    ),
  };
}

export async function runAssessmentAction(): Promise<void> {
  const { db, project } = await getWorkspace();
  runAssessment(db, project.id);
  saveDb(db);
  refresh();
}

export async function resetProjectAction(): Promise<void> {
  const { db, project } = await getWorkspace();
  if (project.source !== "sample") {
    throw new Error("Only the sample project can be reset.");
  }
  resetSampleWorkspace(project);
  addEvidence(db, {
    kind: "project_reset",
    summary: `Workspace of "${project.name}" restored to its original state`,
    projectId: project.id,
  });
  saveDb(db);
  refresh();
}

export async function connectProjectAction(
  _previous: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const input = formData.get("target");
  if (typeof input !== "string") {
    return { error: "Enter a local path or a git repository URL." };
  }

  const { db } = await getWorkspace();
  try {
    await connectProjectInput(db, input);
    saveDb(db);
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
  const { db, userId } = await getWorkspace();
  setActiveProject(db, projectId, userId);
  saveDb(db);
  refresh();
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

  const accessToken = await getGitHubAccessToken();
  if (!accessToken) {
    return {
      error:
        "GitHub access token missing. Sign out and sign in again to grant repo access.",
    };
  }

  const { db } = await getWorkspace();
  const alreadyConnected = db.projects.some(
    (project) =>
      project.source === "github" &&
      project.ownerUserId === userId &&
      project.github?.fullName === fullName,
  );
  if (alreadyConnected) {
    return { error: `${fullName} is already connected. Disconnect it first.` };
  }

  try {
    const repo = await fetchGitHubRepo(accessToken, fullName);
    await connectGitHubRepo(db, {
      fullName: repo.fullName,
      cloneUrl: repo.cloneUrl,
      defaultBranch: repo.defaultBranch,
      private: repo.private,
      ownerUserId: userId,
      accessToken,
    });
    saveDb(db);
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

  const { db } = await getWorkspace();
  try {
    disconnectGitHubRepo(db, projectIdRaw, userId);
    saveDb(db);
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
  formData: FormData,
): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
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

  const project = db.projects.find((candidate) => candidate.id === finding.projectId);
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
  saveDb(db);
  refresh();
}

export async function applyRemediationAction(findingId: string): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const remediation = remediationForFinding(db, findingId);
  if (!finding.fix) throw new Error("This finding has no automatable fix.");

  const { project, match } = locateViolation(db, finding);
  if (!match?.fix) {
    throw new Error("The violation could not be re-located in the current file.");
  }
  const fix = mergeFix(finding.fix, match.fix);
  if (!fix) throw new Error("No applicable fix.");

  const absolutePath = path.join(project.rootPath, finding.location.filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  fs.writeFileSync(absolutePath, applyFix(text, fix));

  replaceRemediation(
    db,
    advanceRemediation(remediation, "implemented", "Suggested change applied to the file"),
  );
  addEvidence(db, {
    kind: "remediation_implemented",
    summary: `Change applied to ${finding.location.filePath}:${finding.location.line}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: { fix: { ...fix } },
  });
  saveDb(db);
  refresh();
}

export async function verifyRemediationAction(findingId: string): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const remediation = remediationForFinding(db, findingId);

  const { match } = locateViolation(db, finding);
  if (match) {
    remediation.history.push({
      status: remediation.status,
      at: new Date().toISOString(),
      note: "Verification failed: the violation is still detected at this location.",
    });
    saveDb(db);
    refresh();
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
  saveDb(db);
  refresh();
}

export async function dismissFindingAction(
  findingId: string,
  formData: FormData,
): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);

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
  saveDb(db);
  refresh();
}

export async function generateAiExplanationAction(findingId: string): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const control = controlById(db, finding.controlId);

  const explanation = await generateAiExplanation(finding, control);
  if (explanation) {
    finding.explanations.push(explanation);
    saveDb(db);
  }
  refresh();
}

export async function generateAiRemediationAction(findingId: string): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
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
  saveDb(db);
  refresh();
}

/**
 * Marks an approved remediation as implemented when the engineer applied the
 * change outside ComplyLoop (or there is no automatable fix).
 */
export async function markRemediationImplementedAction(
  findingId: string,
  formData: FormData,
): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const remediation = remediationForFinding(db, findingId);
  const noteRaw = formData.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim().length > 0
      ? noteRaw.trim()
      : "Marked implemented by user (applied outside the platform)";

  replaceRemediation(db, advanceRemediation(remediation, "implemented", note));
  addEvidence(db, {
    kind: "remediation_implemented",
    summary: `Remediation marked implemented for ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: { manual: true, note },
  });
  saveDb(db);
  refresh();
}

/**
 * Human verification path when automated re-check is unavailable or the user
 * has verified the fix by other means. Still requires an explicit note.
 */
export async function manualVerifyRemediationAction(
  findingId: string,
  formData: FormData,
): Promise<void> {
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const remediation = remediationForFinding(db, findingId);
  const noteRaw = formData.get("note");
  if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
    throw new Error("A verification note is required for manual verification.");
  }
  const note = noteRaw.trim();

  if (remediation.status !== "implemented") {
    throw new Error("Manual verification requires status implemented.");
  }

  replaceRemediation(
    db,
    advanceRemediation(remediation, "verified", `Manual verification: ${note}`),
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
  saveDb(db);
  refresh();
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
  formData: FormData,
): Promise<void> {
  const { db, project } = await getWorkspace();
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
    throw new Error("A note is required when setting a requirement exception.");
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
  saveDb(db);
  refresh();
}

export async function markRequirementPassedAction(
  requirementId: string,
  formData: FormData,
): Promise<void> {
  const { db, project } = await getWorkspace();
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
  saveDb(db);
  refresh();
}

export async function clearRequirementHumanPassAction(
  requirementId: string,
): Promise<void> {
  const { db, project } = await getWorkspace();
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
  saveDb(db);
  refresh();
}

export async function updateRequirementScopeAction(
  formData: FormData,
): Promise<void> {
  const { db, project } = await getWorkspace();
  const selected = formData
    .getAll("controlId")
    .filter((value): value is string => typeof value === "string");
  setProjectScope(db, project, selected);
  saveDb(db);
  refresh();
}

export async function importCustomControlAction(
  formData: FormData,
): Promise<void> {
  const { db, project } = await getWorkspace();
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
  saveDb(db);
  refresh();
}

export async function applyFrameworkPresetAction(
  formData: FormData,
): Promise<void> {
  const presetId = formData.get("presetId");
  if (typeof presetId !== "string" || presetId.length === 0) {
    throw new Error("A framework preset is required.");
  }
  const { db, project } = await getWorkspace();
  applyFrameworkPreset(db, project, presetId);
  saveDb(db);
  refresh();
}

export async function importChecklistAction(
  formData: FormData,
): Promise<void> {
  const checklist = formData.get("checklist");
  if (typeof checklist !== "string" || checklist.trim().length === 0) {
    throw new Error("Paste a checklist to import.");
  }
  const { db, project } = await getWorkspace();
  importChecklist(db, project, checklist);
  saveDb(db);
  refresh();
}

export async function markAlertReadAction(alertId: string): Promise<void> {
  const { db, project } = await getWorkspace();
  const alert = db.alerts.find(
    (candidate) =>
      candidate.id === alertId && candidate.projectId === project.id,
  );
  if (!alert) throw new Error("Unknown alert.");
  alert.read = true;
  saveDb(db);
  refresh();
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
  const { db } = await getWorkspace();
  const finding = findingById(db, findingId);
  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, findingId);
  const project = db.projects.find(
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
    addEvidence(db, {
      kind: "pull_request_prepared",
      summary: result.prUrl
        ? `Pull request prepared for ${finding.checkId}: ${result.prUrl}`
        : `Branch ${result.branch} prepared for ${finding.checkId}`,
      projectId: project.id,
      controlId: finding.controlId,
      findingId: finding.id,
      detail: {
        branch: result.branch,
        prUrl: result.prUrl,
        title: result.title,
      },
    });
    saveDb(db);
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
): Promise<void> {
  const { db, project } = await getWorkspace();
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
  saveDb(db);
  refresh();
}
