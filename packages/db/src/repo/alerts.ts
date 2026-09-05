import { eq, sql } from "drizzle-orm";
import type { Alert } from "@complyloop/analysis-core/contract/finding-types";
import type { DrizzleDb } from "../client.ts";
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

export async function markAlertRead(tx: DrizzleDb, alert: Alert): Promise<void> {
  const updated = { ...alert, read: true };
  await upsertAlerts(tx, [updated]);
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
