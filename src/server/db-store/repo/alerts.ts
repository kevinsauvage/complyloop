import { sql } from "drizzle-orm";
import type { Alert } from "@complyloop/analysis-core/contract/finding-types";
import type { DrizzleDb } from "../client";
import { alerts } from "../schema";
import { alertToRow } from "./mappers";

export async function markAlertRead(tx: DrizzleDb, alert: Alert): Promise<void> {
  const updated = { ...alert, read: true };
  await tx
    .insert(alerts)
    .values(alertToRow(updated))
    .onConflictDoUpdate({
      target: alerts.id,
      set: {
        read: sql`excluded.read`,
        payload: sql`excluded.payload`,
      },
    });
}

export async function insertAlerts(
  tx: DrizzleDb,
  items: ReadonlyArray<Alert>,
): Promise<void> {
  if (items.length === 0) return;
  await tx.insert(alerts).values(items.map(alertToRow));
}
