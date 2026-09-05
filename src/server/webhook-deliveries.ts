import { asc, count, inArray } from "drizzle-orm";
import { getDrizzle } from "@complyloop/db/client";
import { webhookDeliveries } from "@complyloop/db/schema";

const MAX_DELIVERIES = 2000;

async function prunePostgres(): Promise<void> {
  const drizzle = await getDrizzle();
  const [{ total }] = await drizzle
    .select({ total: count() })
    .from(webhookDeliveries);
  if (total <= MAX_DELIVERIES) return;

  const overflow = total - MAX_DELIVERIES;
  const oldest = await drizzle
    .select({ deliveryId: webhookDeliveries.deliveryId })
    .from(webhookDeliveries)
    .orderBy(asc(webhookDeliveries.processedAt))
    .limit(overflow);
  if (oldest.length === 0) return;
  await drizzle
    .delete(webhookDeliveries)
    .where(
      inArray(
        webhookDeliveries.deliveryId,
        oldest.map((row) => row.deliveryId),
      ),
    );
}

/**
 * Atomically claim a GitHub delivery id for processing.
 * Returns true only for the first claimant; later callers get false (duplicate).
 * Empty ids are rejected by the webhook route before calling this.
 */
export async function claimWebhookDelivery(
  deliveryId: string,
): Promise<boolean> {
  if (!deliveryId.trim()) {
    throw new Error("x-github-delivery is required.");
  }

  const processedAt = new Date().toISOString();
  const drizzle = await getDrizzle();
  const inserted = await drizzle
    .insert(webhookDeliveries)
    .values({ deliveryId, processedAt })
    .onConflictDoNothing()
    .returning({ deliveryId: webhookDeliveries.deliveryId });
  if (inserted.length === 0) return false;
  await prunePostgres();
  return true;
}
