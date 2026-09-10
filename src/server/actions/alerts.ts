"use server";

import { z } from "zod";
import { parseForm, requiredField } from "@/core/filters";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { getAlertById, markAlertRead, markAllProjectAlertsRead } from "@complyloop/db/repo/alerts";
import { listMembershipsForOrgs } from "@complyloop/db/repo/orgs";
import { getProjectById } from "@complyloop/db/repo/projects";
import {
  runAction,
  type ActionState,
} from "../action-state";
import { assertProjectPermission } from "../project-visibility";
import { getProjectRuntime } from "../project-runtime";
import { withProjectLock } from "../workspace-write";
import { refresh, requireSignedIn } from "./shared";

const markAlertReadInput = z.object({
  alertId: requiredField("Unknown alert."),
});

export async function markAlertReadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
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

const markAllAlertsReadInput = z.object({
  projectId: requiredField("Unknown project."),
});

export async function markAllAlertsReadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId } = parseForm(markAllAlertsReadInput, formData);
    const { userId, githubLogin } = await requireSignedIn();

    const drizzle = await getDrizzle();
    const project = await getProjectById(drizzle, projectId);
    if (!project) throw new PublicError("Unknown project.");
    const memberships = await listMembershipsForOrgs(drizzle, [project.orgId]);
    assertProjectPermission(
      project,
      { userId, githubLogin, organizations: [], memberships },
      "project.view",
    );

    const runtime = await getProjectRuntime(project.id);
    const count = await withProjectLock(project.id, async (tx) => {
      return markAllProjectAlertsRead(
        tx,
        runtime.alerts.filter((alert) => alert.projectId === project.id),
      );
    });
    refresh();
    return count === 0
      ? "No unread alerts."
      : `${count} alert${count === 1 ? "" : "s"} marked as read.`;
  });
}
