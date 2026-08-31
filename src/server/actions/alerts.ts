"use server";

import { PublicError } from "@/core/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function markAlertReadAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const alertId = formData.get("alertId");
    if (typeof alertId !== "string" || alertId.length === 0) {
      throw new PublicError("Unknown alert.");
    }
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.view");
      const { db, project } = workspace;
      const alert = db.alerts.find(
        (candidate) =>
          candidate.id === alertId && candidate.projectId === project.id,
      );
      if (!alert) throw new PublicError("Unknown alert.");
      alert.read = true;
    });
    refresh();
    return "Alert marked as read.";
  });
}
