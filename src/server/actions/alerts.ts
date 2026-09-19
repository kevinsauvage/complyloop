"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  listAlertsForProject,
  markAlertReadById,
  markAllProjectAlertsRead,
} from "@complyloop/db/repo/alerts";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { withProjectLock } from "../workspace/db";
import {
  requireAlertAccess,
  requireProjectAccess,
} from "../workspace/workspace";
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
    // load), then the mutation under the project write lock. The mark
    // re-reads inside the lock so a concurrent assessment refresh cannot be
    // discarded by a stale payload.
    const { project } = await requireAlertAccess(alertId, "project.view");

    const marked = await withProjectLock(project.id, async (tx) => {
      return markAlertReadById(tx, alertId);
    });
    if (!marked) throw new PublicError("Unknown alert.");
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
