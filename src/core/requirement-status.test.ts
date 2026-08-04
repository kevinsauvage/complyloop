import { describe, expect, it } from "vitest";
import { deriveRequirementStatus } from "./requirement-status";

describe("deriveRequirementStatus", () => {
  it("passes when there are no open findings", () => {
    expect(deriveRequirementStatus([])).toBe("passed");
  });

  it("fails when any open finding is a violation", () => {
    expect(
      deriveRequirementStatus([{ kind: "warning" }, { kind: "violation" }]),
    ).toBe("failed");
  });

  it("needs review when only warnings are open", () => {
    expect(deriveRequirementStatus([{ kind: "warning" }])).toBe("needs_review");
  });
});
