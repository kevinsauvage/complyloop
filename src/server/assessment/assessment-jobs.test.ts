import { describe, expect, it } from "vitest";

import { isJobPayloadWellFormed } from "./assessment-jobs";

/**
 * Fail-closed payload gate (DB-free): corrupt rows must never degrade to
 * `{}` and scan as authoritative. DB paths (claim, enqueue, leases) are
 * covered by `assessment-jobs.concurrency.test.ts` under `test:db`.
 */
describe("isJobPayloadWellFormed", () => {
  it("passes legacy nullish and schema-valid payloads", () => {
    expect(isJobPayloadWellFormed(null)).toBe(true);
    expect(isJobPayloadWellFormed(undefined)).toBe(true);
    expect(isJobPayloadWellFormed({})).toBe(true);
    expect(isJobPayloadWellFormed({ findingId: "f1" })).toBe(true);
    expect(isJobPayloadWellFormed({ eventName: "push", ref: "abc123" })).toBe(
      true,
    );
  });

  it("rejects arrays, scalars, and wrong-typed fields", () => {
    expect(isJobPayloadWellFormed(["push"])).toBe(false);
    expect(isJobPayloadWellFormed("push")).toBe(false);
    expect(isJobPayloadWellFormed(42)).toBe(false);
    expect(isJobPayloadWellFormed({ findingId: 42 })).toBe(false);
    expect(isJobPayloadWellFormed({ eventName: "release" })).toBe(false);
  });
});
