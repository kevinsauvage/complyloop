"use server";

import { z } from "zod";

import { listAlertsForProject, markAlertRead, markAllProjectAlertsRead } from "@complyloop/db/repo/alerts";

import { parseForm, requiredField } from "@/core/filters";

import {
  type ActionState,
  runAction,
} from "../action-state";
import {
  requireAlertAccess,
  requireProjectAccess,
} from "../workspace/workspace";
import { withProjectLock } from "../workspace/workspace-write";
import { refresh } from "./shared";

const markAlertReadInput = z.object({
  alertId: requiredField("Unknown alert."),
});

export async function markAlertReadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { alertId } = parseForm(markAlertReadInput, formData);

    // Single-row touch: permission-scoped alert load (no full workspace
    // load), then the mutation under the project write lock.
    const { alert, project } = await requireAlertAccess(alertId, "project.view");

    await withProjectLock(project.id, async (tx) => {
      await markAlertRead(tx, alert);
    });
    refresh("/dashboard");
    return "Alert marked as read.";
  });
}

const markAllAlertsReadInput = z.object({
  projectId: requiredField("Unknown project."),
});

export async function markAllAlertsReadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId } = parseForm(markAllAlertsReadInput, formData);
    const project = await requireProjectAccess(projectId, "project.view");

    // Read inside the lock so the unread set cannot change between the
    // check and the mark.
    const count = await withProjectLock(project.id, async (tx) => {
      return markAllProjectAlertsRead(
        tx,
        await listAlertsForProject(tx, project.id),
      );
    });
    refresh("/dashboard");
    return count === 0
      ? "No unread alerts."
      : `${count} alert${count === 1 ? "" : "s"} marked as read.`;
  });
}
