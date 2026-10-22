import { describe, expect, it } from "vitest";

import type { AssessmentJob } from "@/core/assessment/assessment-jobs";

import {
  isJobPayloadWellFormed,
  publicAssessmentJobView,
} from "./assessment-jobs";

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

describe("publicAssessmentJobView", () => {
  const job: AssessmentJob = {
    id: "job-1",
    projectId: "p1",
    status: "failed",
    trigger: "webhook",
    requestedByUserId: "user-1",
    idempotencyKey: "delivery-1",
    payload: {
      ref: "a".repeat(40),
      runtimeTarget: {
        url: "https://preview.example/?token=secret",
        sha: "a".repeat(40),
      },
      stage: "runtime",
    },
    attempts: 2,
    maxAttempts: 3,
    availableAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:01:00.000Z",
    leaseExpiresAt: "2026-01-01T00:31:00.000Z",
    error: "clone failed for https://user:ghp_secret@github.com/acme/app",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
  };

  it("drops preview URLs, refs, idempotency keys and the requesting user", () => {
    const view = publicAssessmentJobView(job);
    expect(view.payload).toEqual({ stage: "runtime" });
    expect(view.requestedByUserId).toBeUndefined();
    expect(view.idempotencyKey).toBeUndefined();
    expect(view.leaseExpiresAt).toBeUndefined();
  });

  it("redacts credentials in the error message", () => {
    const view = publicAssessmentJobView(job);
    expect(view.error).not.toContain("ghp_secret");
    expect(view.error).toContain("://***@");
  });
});
