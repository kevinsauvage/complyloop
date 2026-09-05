import { sql } from "drizzle-orm";
import type { Alert } from "@complyloop/analysis-core/contract/finding-types";
import type { DrizzleDb } from "../client.ts";
import { alerts } from "../schema.ts";
import { alertToRow } from "./mappers.ts";

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
