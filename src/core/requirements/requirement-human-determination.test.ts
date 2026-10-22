import { describe, expect, it } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import {
  clearRequirementHumanDetermination,
  exceptionHasLapsed,
  normalizeExpiryInstant,
  setRequirementHumanDetermination,
} from "./requirement-human-determination";

const base: Requirement = {
  id: "req-1",
  projectId: "p1",
  controlId: "ctl-1",
  status: "failed",
  determination: "automated",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("setRequirementHumanDetermination", () => {
  it("sets exception and clears humanPass without keeping the pass's status", () => {
    const withPass: Requirement = {
      ...base,
      humanPass: { note: "ok", at: "2026-01-01T00:00:00.000Z" },
      status: "passed",
      determination: "human_review",
    };
    const { updated, previous } = setRequirementHumanDetermination(withPass, {
      kind: "exception",
      exception: {
        reason: "accepted_risk",
        note: "risk noted",
        at: "2026-02-01T00:00:00.000Z",
      },
    });
    expect(previous).toBe("passed");
    expect(updated.exception?.reason).toBe("accepted_risk");
    expect(updated.humanPass).toBeUndefined();
    expect(updated.determination).toBe("human_review");
    // Nothing backs `passed` once the human pass is gone.
    expect(updated.status).toBe("unable_to_verify");
  });

  it("keeps the current status when an exception is set without a prior human pass", () => {
    const { updated } = setRequirementHumanDetermination(base, {
      kind: "exception",
      exception: {
        reason: "accepted_risk",
        note: "risk noted",
        at: "2026-02-01T00:00:00.000Z",
      },
    });
    expect(updated.status).toBe("failed");
  });

  it("sets not_applicable status when requested", () => {
    const { updated } = setRequirementHumanDetermination(base, {
      kind: "exception",
      exception: {
        reason: "not_applicable",
        note: "n/a",
        at: "2026-02-01T00:00:00.000Z",
      },
      nextStatus: "not_applicable",
    });
    expect(updated.status).toBe("not_applicable");
  });

  it("sets humanPass and clears exception", () => {
    const withException: Requirement = {
      ...base,
      exception: {
        reason: "temporary",
        note: "tmp",
        at: "2026-01-01T00:00:00.000Z",
      },
      determination: "human_review",
    };
    const { updated } = setRequirementHumanDetermination(withException, {
      kind: "humanPass",
      humanPass: { note: "reviewed", at: "2026-02-01T00:00:00.000Z" },
    });
    expect(updated.status).toBe("passed");
    expect(updated.humanPass?.note).toBe("reviewed");
    expect(updated.exception).toBeUndefined();
  });
});

describe("clearRequirementHumanDetermination", () => {
  it("clears humanPass and resets determination", () => {
    const cleared = clearRequirementHumanDetermination(
      {
        ...base,
        humanPass: { note: "ok", at: "2026-01-01T00:00:00.000Z" },
        determination: "human_review",
        status: "passed",
      },
      "humanPass",
    );
    expect(cleared.humanPass).toBeUndefined();
    expect(cleared.determination).toBe("automated");
    expect(cleared.status).toBe("passed");
  });

  it("clears exception without touching humanPass", () => {
    const cleared = clearRequirementHumanDetermination(
      {
        ...base,
        exception: {
          reason: "accepted_risk",
          note: "ok",
          at: "2026-01-01T00:00:00.000Z",
        },
        determination: "human_review",
      },
      "exception",
    );
    expect(cleared.exception).toBeUndefined();
    expect(cleared.determination).toBe("automated");
  });
});

describe("normalizeExpiryInstant", () => {
  it("extends date-only input to end of day UTC", () => {
    expect(normalizeExpiryInstant("2026-09-30")).toBe(
      "2026-09-30T23:59:59.999Z",
    );
    expect(normalizeExpiryInstant("  2026-09-30  ")).toBe(
      "2026-09-30T23:59:59.999Z",
    );
  });

  it("passes full instants through and rejects garbage", () => {
    expect(normalizeExpiryInstant("2026-09-30T12:00:00.000Z")).toBe(
      "2026-09-30T12:00:00.000Z",
    );
    expect(normalizeExpiryInstant("not a date")).toBeNull();
  });
});

describe("exhaustive switches", () => {
  it("fails loud on unknown override kinds and fields", () => {
    expect(() =>
      setRequirementHumanDetermination(base, { kind: "bogus" } as never),
    ).toThrow(/Unhandled human determination/);
    expect(() =>
      clearRequirementHumanDetermination(base, "bogus" as never),
    ).toThrow(/Unhandled clear field/);
  });
});

describe("exceptionHasLapsed", () => {
  const now = Date.parse("2026-06-01T12:00:00.000Z");
  const temporary = (expiresAt?: string) => ({
    reason: "temporary" as const,
    note: "fix scheduled",
    at: "2026-05-01T00:00:00.000Z",
    expiresAt,
  });

  it("is true once a temporary exception is past its expiry", () => {
    expect(exceptionHasLapsed(temporary("2026-06-01T11:59:59.999Z"), now)).toBe(
      true,
    );
    expect(exceptionHasLapsed(temporary("2026-06-01T12:00:00.001Z"), now)).toBe(
      false,
    );
  });

  it("treats an unparseable expiry as lapsed", () => {
    expect(exceptionHasLapsed(temporary("not a date"), now)).toBe(true);
  });

  it("never lapses an exception without an expiry or of another reason", () => {
    expect(exceptionHasLapsed(undefined, now)).toBe(false);
    expect(exceptionHasLapsed(temporary(undefined), now)).toBe(false);
    expect(
      exceptionHasLapsed(
        {
          reason: "accepted_risk",
          note: "accepted",
          at: "2026-05-01T00:00:00.000Z",
          expiresAt: "2026-01-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });
});
