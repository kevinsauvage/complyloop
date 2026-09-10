import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookDelivery } from "./webhook-deliveries";

const claimed = vi.hoisted(() => new Set<string>());
const pruneState = vi.hoisted(() => ({
  totalOverride: null as number | null,
  deletedIds: [] as string[],
}));

vi.mock("@complyloop/db/postgres", () => ({
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
          from: async () => [
            { total: pruneState.totalOverride ?? claimed.size },
          ],
        };
      }
      return {
        from: () => ({
          orderBy: () => ({
            limit: async (overflow: number) =>
              Array.from({ length: overflow }, (_, index) => ({
                deliveryId: `old-${index}`,
              })),
          }),
        }),
      };
    },
    delete: () => ({
      where: async () => {
        pruneState.deletedIds.push("pruned");
      },
    }),
  }),
}));

beforeEach(() => {
  claimed.clear();
  pruneState.totalOverride = null;
  pruneState.deletedIds = [];
});

describe("webhook delivery idempotency", () => {
  it("claims a delivery once and rejects duplicates", async () => {
    expect(await claimWebhookDelivery("del-1")).toBe(true);
    expect(await claimWebhookDelivery("del-1")).toBe(false);
    expect(await claimWebhookDelivery("del-2")).toBe(true);
  });

  it("allows concurrent claimants for the same id to produce one winner", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimWebhookDelivery("concurrent-1")),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects empty delivery ids", async () => {
    await expect(claimWebhookDelivery("")).rejects.toThrow(
      /x-github-delivery/,
    );
  });

  it("prunes oldest rows once the delivery table exceeds the cap", async () => {
    pruneState.totalOverride = 2001;
    expect(await claimWebhookDelivery("del-overflow")).toBe(true);
    expect(pruneState.deletedIds).toEqual(["pruned"]);
  });
});
