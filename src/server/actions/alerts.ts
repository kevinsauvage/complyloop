"use server";

import { z } from "zod";
import { requiredField } from "@/core/boundary";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { getDrizzle } from "@complyloop/db/client";
import { markAlertRead } from "@complyloop/db/repo/alerts";
import { alertById, getWorkspace } from "../workspace";
import { refresh, requireOnActive } from "./shared";

const markAlertReadInput = z.object({
  alertId: requiredField("Unknown alert."),
});

export async function markAlertReadAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { alertId } = parseForm(markAlertReadInput, formData);
    const workspace = await getWorkspace();
    requireOnActive(workspace, "project.view");
    const alert = alertById(workspace.db, alertId, workspace.project!.id);

    const drizzle = await getDrizzle();
    await drizzle.transaction(async (tx) => {
      await markAlertRead(tx, alert);
    });
    refresh();
    return "Alert marked as read.";
  });
}
