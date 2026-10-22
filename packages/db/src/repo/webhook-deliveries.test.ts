import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import {
  claimWebhookDeliveryRow,
  pruneWebhookDeliveryRows,
} from "./webhook-deliveries.ts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("webhook delivery idempotency", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("claims a delivery once and rejects the duplicate", async () => {
    const drizzle = await getDrizzle();
    const deliveryId = `delivery-${Date.now()}`;
    try {
      expect(
        await claimWebhookDeliveryRow(
          drizzle,
          deliveryId,
          "2026-01-01T00:00:00.000Z",
        ),
      ).toBe(true);
      expect(
        await claimWebhookDeliveryRow(
          drizzle,
          deliveryId,
          "2026-01-01T00:00:00.000Z",
        ),
      ).toBe(false);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM webhook_deliveries WHERE delivery_id = ${deliveryId}`,
      );
    }
  });

  it("prunes the oldest rows above the cap", async () => {
    const drizzle = await getDrizzle();
    const prefix = `prune-${Date.now()}`;
    try {
      for (let index = 0; index < 3; index += 1) {
        await drizzle.execute(sql`
          INSERT INTO webhook_deliveries (delivery_id, processed_at)
          VALUES (${`${prefix}-${index}`}, ${`2026-01-0${index + 1}T00:00:00.000Z`})
        `);
      }
      await pruneWebhookDeliveryRows(drizzle, 2);
      const remaining = await drizzle.execute(sql`
        SELECT delivery_id FROM webhook_deliveries
        WHERE delivery_id LIKE ${`${prefix}-%`}
        ORDER BY processed_at ASC
      `);
      expect(
        remaining.map((row) => (row as { delivery_id: string }).delivery_id),
      ).toEqual([`${prefix}-1`, `${prefix}-2`]);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM webhook_deliveries WHERE delivery_id LIKE ${`${prefix}-%`}`,
      );
    }
  });
});
