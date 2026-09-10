import { eq, inArray, sql } from "drizzle-orm";

import type { Alert } from "@complyloop/analysis-core/contract/entities";

import type { DrizzleDb } from "../postgres.ts";
import { alerts } from "../schema.ts";
import { alertToRow } from "./mappers.ts";

export async function getAlertById(
  drizzle: DrizzleDb,
  alertId: string,
): Promise<Alert | undefined> {
  const rows = await drizzle
    .select({ payload: alerts.payload })
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);
  return rows[0]?.payload;
}

export async function listAlertsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Alert[]> {
  const rows = await drizzle
    .select({ payload: alerts.payload })
    .from(alerts)
    .where(eq(alerts.projectId, projectId));
  return rows.map((row) => row.payload);
}

export async function listAlertsForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<Alert[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: alerts.payload })
    .from(alerts)
    .where(inArray(alerts.projectId, [...projectIds]));
  return rows.map((row) => row.payload);
}

export async function markAlertRead(
  tx: DrizzleDb,
  alert: Alert,
): Promise<void> {
  const updated = { ...alert, read: true };
  await upsertAlerts(tx, [updated]);
}

export async function markAllProjectAlertsRead(
  tx: DrizzleDb,
  projectAlerts: ReadonlyArray<Alert>,
): Promise<number> {
  const unread = projectAlerts.filter((alert) => !alert.read);
  if (unread.length === 0) return 0;
  await upsertAlerts(
    tx,
    unread.map((alert) => ({ ...alert, read: true })),
  );
  return unread.length;
}

/**
 * Upserts alerts (same pattern as findings/remediations/requirements) so the
 * slice-diff write model can update an existing alert row without a
 * primary-key violation. `read` must be persisted along with `payload`.
 */
export async function upsertAlerts(
  tx: DrizzleDb,
  items: ReadonlyArray<Alert>,
): Promise<void> {
  if (items.length === 0) return;
  await tx
    .insert(alerts)
    .values(items.map(alertToRow))
    .onConflictDoUpdate({
      target: alerts.id,
      set: {
        projectId: sql`excluded.project_id`,
        read: sql`excluded.read`,
        payload: sql`excluded.payload`,
      },
    });
}

export async function insertAlerts(
  tx: DrizzleDb,
  items: ReadonlyArray<Alert>,
): Promise<void> {
  await upsertAlerts(tx, items);
}
