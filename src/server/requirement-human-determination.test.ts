import { describe, expect, it } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

import {
  clearRequirementHumanDetermination,
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
  it("sets exception and clears humanPass", () => {
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
    expect(updated.status).toBe("passed");
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
