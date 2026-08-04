"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { generateAiExplanation } from "@/ai/explainer";
import { applyFix } from "@/analysis/fixes";
import { scanFile } from "@/analysis/scan";
import { advanceRemediation } from "@/core/remediation";
import type { Dismissal, Finding } from "@/core/types";
import {
  buildSuggestion,
  mergeFix,
  refreshRequirementStatuses,
  runAssessment,
} from "./assessment";
import { addEvidence, saveDb, type Db } from "./db";
import { resetSampleWorkspace } from "./seed";
import {
  controlById,
  findingById,
  getWorkspace,
  remediationForFinding,
} from "./workspace";

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
  const { db, project } = getWorkspace();
  runAssessment(db, project.id);
  saveDb(db);
  refresh();
}

export async function resetProjectAction(): Promise<void> {
  const { db, project } = getWorkspace();
  resetSampleWorkspace(project);
  addEvidence(db, {
    kind: "project_reset",
    summary: `Workspace of "${project.name}" restored to its original state`,
    projectId: project.id,
  });
  saveDb(db);
  refresh();
}

export async function approveRemediationAction(
  findingId: string,
  formData: FormData,
): Promise<void> {
  const { db } = getWorkspace();
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
  const { db } = getWorkspace();
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
  const { db } = getWorkspace();
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
  const { db } = getWorkspace();
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
  const { db } = getWorkspace();
  const finding = findingById(db, findingId);
  const control = controlById(db, finding.controlId);

  const explanation = await generateAiExplanation(finding, control);
  if (explanation) {
    finding.explanations.push(explanation);
    saveDb(db);
  }
  refresh();
}
