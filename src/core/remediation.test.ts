import { describe, expect, it } from "vitest";
import { advanceRemediation, canTransition } from "./remediation";
import type { Remediation } from "./finding-types";

function remediation(status: Remediation["status"]): Remediation {
  return {
    id: "r1",
    findingId: "f1",
    status,
    suggestion: null,
    history: [{ status: "detected", at: "2026-01-01T00:00:00.000Z" }],
  };
}

describe("canTransition", () => {
  it("follows the remediation lifecycle in order", () => {
    expect(canTransition("detected", "suggested")).toBe(true);
    expect(canTransition("suggested", "approved")).toBe(true);
    expect(canTransition("approved", "implemented")).toBe(true);
    expect(canTransition("implemented", "verified")).toBe(true);
  });

  it("rejects skipping stages or moving backwards", () => {
    expect(canTransition("detected", "verified")).toBe(false);
    expect(canTransition("suggested", "implemented")).toBe(false);
    expect(canTransition("approved", "suggested")).toBe(false);
    expect(canTransition("verified", "detected")).toBe(false);
  });

  it("throws on an unknown remediation status at runtime", () => {
    expect(() =>
      canTransition(
        "bogus" as unknown as Remediation["status"],
        "suggested",
      ),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("advanceRemediation", () => {
  it("appends a history entry on a valid transition", () => {
    const advanced = advanceRemediation(remediation("suggested"), "approved", "ok");
    expect(advanced.status).toBe("approved");
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1]).toMatchObject({ status: "approved", note: "ok" });
  });

  it("throws on an invalid transition", () => {
    expect(() => advanceRemediation(remediation("detected"), "verified")).toThrow(
      /Invalid remediation transition/,
    );
  });
});
