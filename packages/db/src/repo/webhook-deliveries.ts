import { asc, count, inArray } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";
import { webhookDeliveries } from "../schema.ts";

/**
 * GitHub webhook delivery idempotency store. Pure persistence — delivery
 * validation lives in `src/server/github/webhook-deliveries.ts`.
 */
export async function claimWebhookDeliveryRow(
  db: DrizzleDb,
  deliveryId: string,
  processedAt: string,
): Promise<boolean> {
  const inserted = await db
    .insert(webhookDeliveries)
    .values({ deliveryId, processedAt })
    .onConflictDoNothing()
    .returning({ deliveryId: webhookDeliveries.deliveryId });
  return inserted.length > 0;
}

export async function pruneWebhookDeliveryRows(
  db: DrizzleDb,
  maxDeliveries: number,
): Promise<void> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(webhookDeliveries);
  if (total <= maxDeliveries) return;

  const overflow = total - maxDeliveries;
  const oldest = await db
    .select({ deliveryId: webhookDeliveries.deliveryId })
    .from(webhookDeliveries)
    .orderBy(asc(webhookDeliveries.processedAt))
    .limit(overflow);
  if (oldest.length === 0) return;
  await db.delete(webhookDeliveries).where(
    inArray(
      webhookDeliveries.deliveryId,
      oldest.map((row) => row.deliveryId),
    ),
  );
}
