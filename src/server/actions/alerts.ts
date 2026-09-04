"use server";

import { PublicError } from "@/core/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { getDrizzle } from "../db-store/client";
import { markAlertRead } from "../db-store/repo/alerts";
import { alertById, getWorkspace } from "../workspace";
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
    const workspace = await getWorkspace();
    requireOnActive(workspace, "project.view");
    const alert = alertById(workspace.db, alertId, workspace.project!.id);

    const drizzle = await getDrizzle();
    await drizzle.transaction(async (tx) => {
      await markAlertRead(tx, { ...alert, read: true });
    });
    refresh();
    return "Alert marked as read.";
  });
}
