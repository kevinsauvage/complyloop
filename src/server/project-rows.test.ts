import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";
import { appendEvidence, stampEvidenceActor } from "./project-rows";

function record(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: "e1",
    at: "2026-09-10T00:00:00.000Z",
    kind: "finding",
    summary: "entry",
    ...overrides,
  };
}

describe("stampEvidenceActor", () => {
  it("stamps unset actors and preserves explicit ones", () => {
    const rows = [record(), record({ actor: "worker" })];
    stampEvidenceActor(rows, "octocat");
    expect(rows[0]?.actor).toBe("octocat");
    expect(rows[1]?.actor).toBe("worker");
  });

  it("tolerates a missing payload", () => {
    expect(() => stampEvidenceActor(undefined, "octocat")).not.toThrow();
  });

  it("stamps records built by appendEvidence", () => {
    const target: { evidence?: EvidenceRecord[] } = {};
    appendEvidence(target, { kind: "finding", summary: "entry" });
    stampEvidenceActor(target.evidence, "octocat");
    expect(target.evidence?.[0]?.actor).toBe("octocat");
  });
});
