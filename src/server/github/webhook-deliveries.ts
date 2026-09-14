import "server-only";

import { getDrizzle } from "@complyloop/db/postgres";
import {
  claimWebhookDeliveryRow,
  pruneWebhookDeliveryRows,
} from "@complyloop/db/repo/webhook-deliveries";

const MAX_DELIVERIES = 2000;

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
  const claimed = await claimWebhookDeliveryRow(
    drizzle,
    deliveryId,
    processedAt,
  );
  if (!claimed) return false;
  await pruneWebhookDeliveryRows(drizzle, MAX_DELIVERIES);
  return true;
}
