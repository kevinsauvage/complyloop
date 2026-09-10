import { describe, expect, it, vi } from "vitest";

import type { DrizzleDb } from "../postgres.ts";
import { listOrgIdsForUser } from "./orgs.ts";

/** Collect primitive / Param values from a drizzle SQL tree (no circular JSON). */
function sqlBoundValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null) return out;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    out.push(node);
    return out;
  }
  if (typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown };
  if ("value" in record && record.value !== undefined && !("queryChunks" in record)) {
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
  if (Array.isArray(record.value) && record.value.every((part) => typeof part === "string")) {
    out.push(...(record.value as string[]));
  }
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) sqlStringParts(chunk, out);
  }
  return out;
}

describe("listOrgIdsForUser", () => {
  it("compares github login case-insensitively via lower()", async () => {
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
