import { describe, expect, it } from "vitest";

import {
  FINDING_STATUSES,
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUS_DISPLAY_ORDER,
  REQUIREMENT_STATUSES,
} from "./statuses";

describe("contract statuses", () => {
  it("exposes the exact requirement status vocabulary", () => {
    expect(REQUIREMENT_STATUSES).toEqual([
      "passed",
      "failed",
      "needs_review",
      "not_applicable",
      "unable_to_verify",
    ]);
  });

  it("orders requirement statuses for UI display", () => {
    expect(REQUIREMENT_STATUS_DISPLAY_ORDER).toEqual([
      "failed",
      "needs_review",
      "passed",
      "not_applicable",
      "unable_to_verify",
    ]);
    // Display order is a permutation of the status vocabulary.
    expect([...REQUIREMENT_STATUS_DISPLAY_ORDER].sort()).toEqual(
      [...REQUIREMENT_STATUSES].sort(),
    );
  });

  it("exposes remediation and finding statuses", () => {
    expect(REMEDIATION_STATUSES).toEqual([
      "detected",
      "suggested",
      "approved",
      "implemented",
      "verified",
    ]);
    expect(FINDING_STATUSES).toEqual(["open", "resolved", "dismissed"]);
  });
});
