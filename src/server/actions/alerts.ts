"use server";

import { z } from "zod";
import { requiredField } from "@/core/boundary";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/client";
import { getAlertById, markAlertRead } from "@complyloop/db/repo/alerts";
import { listMembershipsForOrgs } from "@complyloop/db/repo/orgs";
import { getProjectById } from "@complyloop/db/repo/projects";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { assertProjectPermission } from "../project-visibility";
import { withProjectLock } from "../workspace";
import { refresh, requireSignedIn } from "./shared";

const markAlertReadInput = z.object({
  alertId: requiredField("Unknown alert."),
});

export async function markAlertReadAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { alertId } = parseForm(markAlertReadInput, formData);
    const { userId, githubLogin } = await requireSignedIn();

    // Single-row touch: load only what RBAC needs (alert → project → the
    // project org's memberships) instead of a full workspace load (P3-5).
    const drizzle = await getDrizzle();
    const alert = await getAlertById(drizzle, alertId);
    if (!alert) throw new PublicError("Unknown alert.");
    const project = await getProjectById(drizzle, alert.projectId);
    if (!project) throw new PublicError("Unknown alert.");
    const memberships = await listMembershipsForOrgs(drizzle, [project.orgId]);
    assertProjectPermission(
      project,
      { userId, githubLogin, organizations: [], memberships },
      "project.view",
    );

    await withProjectLock(project.id, async (tx) => {
      await markAlertRead(tx, alert);
    });
    refresh();
    return "Alert marked as read.";
  });
}
