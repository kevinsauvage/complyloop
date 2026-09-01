"use server";

import type { Dismissal } from "@/core/finding-types";
import { canBulkApproveRemediation } from "@/core/finding-act";
import { formatLocationRef } from "@/core/location";
import { PublicError } from "@/core/public-error";
import { advanceRemediation } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { refreshRequirementStatuses } from "../assessment-status";
import { addEvidence } from "../db";
import {
  findingById,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  refresh,
  readFindingIds,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

function isDismissalReason(value: unknown): value is Dismissal["reason"] {
  return (
    value === "false_positive" ||
    value === "not_applicable" ||
    value === "accepted_risk"
  );
}

export async function approveRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

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
    return "Remediation approved.";
  });
}

/** Approves remediations that are already in `suggested` (skips others). */
export async function bulkApproveRemediationsAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingIds = readFindingIds(formData);
    if (findingIds.length === 0) {
      throw new PublicError("Select at least one finding to approve.");
    }
    let approved = 0;

    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        const remediation = remediationForFinding(db, findingId);
        if (!canBulkApproveRemediation(finding, remediation.status)) continue;

        replaceRemediation(
          db,
          advanceRemediation(remediation, "approved", "Approved in bulk"),
        );
        addEvidence(db, {
          kind: "remediation_approved",
          summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: {
            bulk: true,
            ...(finding.fix ? { fix: { ...finding.fix } } : {}),
          },
        });
        approved += 1;
      }
    });

    if (approved === 0) {
      throw new PublicError(
        "No selected findings had runtime guidance ready to approve.",
      );
    }
    refresh();
    return `Approved ${approved} remediation${approved === 1 ? "" : "s"}.`;
  });
}

export async function dismissFindingAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");

      const reason = formData.get("reason");
      const note = formData.get("note");
      if (!isDismissalReason(reason)) {
        throw new PublicError("A dismissal reason is required.");
      }

      finding.status = "dismissed";
      finding.dismissal = {
        reason,
        note: typeof note === "string" ? note.trim() : "",
        at: new Date().toISOString(),
      };
      addEvidence(db, {
        kind: "finding_dismissed",
        summary: `Finding dismissed (${reason}): ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { reason, note: finding.dismissal.note },
      });
      refreshRequirementStatuses(db, finding.projectId);
    });
    refresh();
    return "Finding dismissed.";
  });
}

export async function bulkDismissFindingsAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingIds = readFindingIds(formData);
    if (findingIds.length === 0) {
      throw new PublicError("Select at least one finding to dismiss.");
    }
    const reason = formData.get("reason");
    const note = formData.get("note");
    if (!isDismissalReason(reason)) {
      throw new PublicError("A dismissal reason is required.");
    }
    const dismissalNote = typeof note === "string" ? note.trim() : "";
    const at = new Date().toISOString();
    let dismissed = 0;
    const projectIds = new Set<string>();

    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        if (finding.status !== "open") continue;

        finding.status = "dismissed";
        finding.dismissal = {
          reason,
          note: dismissalNote,
          at,
        };
        addEvidence(db, {
          kind: "finding_dismissed",
          summary: `Finding dismissed (${reason}): ${finding.checkId} at ${formatLocationRef(finding.location)}`,
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: { reason, note: dismissalNote, bulk: true },
        });
        projectIds.add(finding.projectId);
        dismissed += 1;
      }
      for (const projectId of projectIds) {
        refreshRequirementStatuses(db, projectId);
      }
    });

    if (dismissed === 0) {
      throw new PublicError("No open findings were dismissed.");
    }
    refresh();
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
