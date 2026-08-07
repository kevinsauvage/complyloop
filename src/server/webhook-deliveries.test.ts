import { beforeEach, describe, expect, it, vi } from "vitest";

const claimed = vi.hoisted(() => new Set<string>());

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return {
    ...actual,
    eq: (_column: unknown, value: unknown) => ({ __eqValue: value }),
  };
});

vi.mock("./db-store/client", () => ({
  getDrizzle: async () => ({
    insert: () => ({
      values: (value: { deliveryId: string; processedAt: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (claimed.has(value.deliveryId)) return [];
            claimed.add(value.deliveryId);
            return [{ deliveryId: value.deliveryId }];
          },
        }),
      }),
    }),
    select: (shape?: { total?: unknown }) => {
      if (shape && "total" in shape) {
        return {
          from: async () => [{ total: claimed.size }],
        };
      }
      return {
        from: () => ({
          where: (clause: { __eqValue?: unknown }) => ({
            limit: async () => {
              const id = clause.__eqValue;
              if (typeof id === "string" && claimed.has(id)) {
                return [{ deliveryId: id }];
              }
              return [];
            },
          }),
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      };
    },
    delete: () => ({
      where: async () => undefined,
    }),
  }),
}));

import {
  claimWebhookDelivery,
  hasProcessedWebhookDelivery,
} from "./webhook-deliveries";

beforeEach(() => {
  claimed.clear();
});

describe("webhook delivery idempotency", () => {
  it("claims a delivery once and rejects duplicates", async () => {
    expect(await claimWebhookDelivery("del-1")).toBe(true);
    expect(await hasProcessedWebhookDelivery("del-1")).toBe(true);
    expect(await claimWebhookDelivery("del-1")).toBe(false);
    expect(await claimWebhookDelivery("del-2")).toBe(true);
  });

  it("allows concurrent claimants for the same id to produce one winner", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimWebhookDelivery("concurrent-1")),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await hasProcessedWebhookDelivery("concurrent-1")).toBe(true);
  });

  it("cannot dedupe empty delivery ids", async () => {
    expect(await claimWebhookDelivery("")).toBe(true);
    expect(await claimWebhookDelivery("")).toBe(true);
    expect(await hasProcessedWebhookDelivery("")).toBe(false);
  });
});
