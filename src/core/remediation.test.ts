import { describe, expect, it } from "vitest";
import { advanceRemediation } from "./remediation";
import type { Remediation } from "@complyloop/db/types";

function remediation(status: Remediation["status"]): Remediation {
  return {
    id: "r1",
    findingId: "f1",
    status,
    suggestion: null,
    history: [{ status: "detected", at: "2026-01-01T00:00:00.000Z" }],
  };
}

describe("advanceRemediation", () => {
  it("follows the remediation lifecycle in order", () => {
    expect(advanceRemediation(remediation("detected"), "suggested").status).toBe(
      "suggested",
    );
    expect(advanceRemediation(remediation("suggested"), "approved").status).toBe(
      "approved",
    );
    expect(advanceRemediation(remediation("approved"), "implemented").status).toBe(
      "implemented",
    );
    expect(
      advanceRemediation(remediation("implemented"), "verified").status,
    ).toBe("verified");
  });

  it("appends a history entry on a valid transition", () => {
    const advanced = advanceRemediation(remediation("suggested"), "approved", "ok");
    expect(advanced.status).toBe("approved");
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1]).toMatchObject({ status: "approved", note: "ok" });
  });

  it("rejects skipping stages or moving backwards", () => {
    expect(() => advanceRemediation(remediation("detected"), "verified")).toThrow(
      /Invalid remediation transition/,
    );
    expect(() =>
      advanceRemediation(remediation("suggested"), "implemented"),
    ).toThrow(/Invalid remediation transition/);
    expect(() => advanceRemediation(remediation("approved"), "suggested")).toThrow(
      /Invalid remediation transition/,
    );
    expect(() => advanceRemediation(remediation("verified"), "detected")).toThrow(
      /Invalid remediation transition/,
    );
  });
});
