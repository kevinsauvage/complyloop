import { describe, expect, it, vi } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import type { DrizzleDb } from "../postgres.ts";
import {
  claimMembershipsForLogin,
  isUnclaimedInviteExpired,
  listOrgIdsForUser,
} from "./orgs.ts";

/** Collect primitive / Param values from a drizzle SQL tree (no circular JSON). */
function sqlBoundValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null) return out;
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    out.push(node);
    return out;
  }
  if (typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown };
  if (
    "value" in record &&
    record.value !== undefined &&
    !("queryChunks" in record)
  ) {
    out.push(record.value);
    return out;
  }
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) sqlBoundValues(chunk, out);
  }
  return out;
}

function sqlStringParts(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown };
  if (
    Array.isArray(record.value) &&
    record.value.every((part) => typeof part === "string")
  ) {
    out.push(...(record.value as string[]));
  }
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) sqlStringParts(chunk, out);
  }
  return out;
}

describe("listOrgIdsForUser", () => {
  it("compares github login case-insensitively via lower()", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const where = vi.fn(async (_clause: unknown) => [{ orgId: "org-mixed" }]);
    const drizzle = {
      select: () => ({
        from: () => ({ where }),
      }),
    } as unknown as DrizzleDb;

    const ids = await listOrgIdsForUser(drizzle, null, "  AliceDev  ");
    expect(ids).toEqual(["org-mixed"]);
    expect(where).toHaveBeenCalledOnce();

    const clause = where.mock.calls[0]![0];
    const bound = sqlBoundValues(clause);
    const parts = sqlStringParts(clause).join("");
    expect(bound).toContain("alicedev");
    expect(bound).not.toContain("AliceDev");
    expect(parts.toLowerCase()).toContain("lower(");
  });

  it("returns empty when neither userId nor login is usable", async () => {
    const select = vi.fn();
    const drizzle = { select } as unknown as DrizzleDb;
    expect(await listOrgIdsForUser(drizzle, null, null)).toEqual([]);
    expect(await listOrgIdsForUser(drizzle, null, "   ")).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});

function invitePayload(createdAt: string): OrgMembership {
  return {
    id: "m-invite",
    orgId: "org-1",
    role: "member",
    githubLogin: "bob",
    createdAt,
  };
}

describe("isUnclaimedInviteExpired", () => {
  it("expires unclaimed invites past 30 days, never claimed rows", () => {
    const now = Date.parse("2026-09-17T00:00:00.000Z");
    expect(
      isUnclaimedInviteExpired(invitePayload("2026-07-01T00:00:00.000Z"), now),
    ).toBe(true);
    expect(
      isUnclaimedInviteExpired(invitePayload("2026-09-01T00:00:00.000Z"), now),
    ).toBe(false);
    expect(
      isUnclaimedInviteExpired(
        { ...invitePayload("2026-07-01T00:00:00.000Z"), userId: "user-1" },
        now,
      ),
    ).toBe(false);
    expect(isUnclaimedInviteExpired(invitePayload("not-a-date"), now)).toBe(
      false,
    );
  });
});

describe("claimMembershipsForLogin", () => {
  it("prunes expired unclaimed invites instead of granting them", async () => {
    const stale = invitePayload("2026-01-01T00:00:00.000Z");
    const fresh = {
      ...invitePayload(new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      id: "m-fresh",
    };
    const upserted: string[] = [];
    const deleted: string[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: async () => [
            { payload: stale, userId: null },
            { payload: fresh, userId: null },
          ],
        }),
      }),
      insert: () => ({
        values: (row: { id: string }) => ({
          onConflictDoUpdate: async () => {
            upserted.push(row.id);
          },
        }),
      }),
      delete: () => ({
        where: async () => {
          deleted.push(stale.id);
        },
      }),
    } as unknown as DrizzleDb;

    const changed = await claimMembershipsForLogin(tx, "user-9", "bob");
    expect(changed).toBe(true);
    expect(upserted).toEqual(["m-fresh"]);
    expect(deleted).toEqual(["m-invite"]);
  });
});
