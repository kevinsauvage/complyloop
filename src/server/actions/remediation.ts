"use server";

import fs from "node:fs";
import { applyFix } from "@/analysis/fixes";
import type { CheckId } from "@/analysis/types";
import { runtimeViolationStillPresent } from "@/analysis/runtime/scan";
import { resolveInside } from "@/analysis/workspace-path";
import { formatLocationRef, isSourceLocation } from "@/core/location";
import { advanceRemediation } from "@/core/remediation";
import {
  actionErrorState,
  type ActionMessageState,
} from "../action-state";
import { buildSuggestion, mergeFix } from "../assessment-helpers";
import { refreshRequirementStatuses } from "../assessment-status";
import { addEvidence } from "../db";
import { STILL_FAILING_VERIFY_MESSAGE } from "../verify-messages";
import {
  findingById,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  locateViolation,
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

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
        summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
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
      if (!isSourceLocation(finding.location)) {
        throw new Error(
          "Runtime DOM findings cannot be auto-applied — fix the call site and verify with a re-audit.",
        );
      }

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
        summary: `Change applied to ${formatLocationRef(finding.location)}`,
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

      if (finding.location.kind === "dom") {
        const present = await runtimeViolationStillPresent({
          checkId: finding.checkId as CheckId,
          location: finding.location,
        });
        if (present) {
          stillFailing = true;
          remediation.history.push({
            status: remediation.status,
            at: new Date().toISOString(),
            note: "Verification failed: the violation is still detected on the page.",
          });
          return;
        }
        replaceRemediation(
          db,
          advanceRemediation(
            remediation,
            "verified",
            "Runtime re-audit found no remaining violation on the page",
          ),
        );
        finding.status = "resolved";
        finding.resolvedNote = "Fix verified by re-running the runtime audit.";
        addEvidence(db, {
          kind: "remediation_verified",
          summary: `Verified: ${finding.checkId} no longer fails at ${formatLocationRef(finding.location)}`,
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: { engine: "runtime" },
        });
        refreshRequirementStatuses(db, finding.projectId);
        return;
      }

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
        summary: `Verified: ${finding.checkId} no longer fails at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { engine: "ast" },
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
        summary: `Remediation marked implemented for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
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
        summary: `Manually verified ${finding.checkId} at ${formatLocationRef(finding.location)}`,
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
