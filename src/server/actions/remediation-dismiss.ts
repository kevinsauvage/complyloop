"use server";

import type { Dismissal } from "@/core/types";
import {
  actionErrorState,
  type ActionMessageState,
} from "../action-state";
import { refreshRequirementStatuses } from "../assessment-status";
import { addEvidence } from "../db";
import { findingById, withWorkspaceWrite } from "../workspace";
import { refresh, requireOnFindingProject } from "./shared";

function isDismissalReason(value: unknown): value is Dismissal["reason"] {
  return (
    value === "false_positive" ||
    value === "not_applicable" ||
    value === "accepted_risk"
  );
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

