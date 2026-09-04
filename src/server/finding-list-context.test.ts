import { describe, expect, it, vi } from "vitest";
import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testRemediation } from "@/test-fixtures/remediation";
import { emptyDb } from "./db";
import { buildFindingFilterContext } from "./finding-list-context";

vi.mock("./workspace", () => ({
  remediationForFinding: (
    db: { remediations: Array<{ findingId: string; status: string }> },
    findingId: string,
  ) => {
    const remediation = db.remediations.find((row) => row.findingId === findingId);
    if (!remediation) throw new Error(`missing remediation for ${findingId}`);
    return remediation;
  },
}));

describe("buildFindingFilterContext", () => {
  it("exposes remediations and leaves cluster ids unset without a cluster filter", () => {
    const db = emptyDb();
    db.controls.push(testControl());
    db.findings.push(testFinding());
    db.remediations.push(testRemediation({ status: "approved" }));

    const context = buildFindingFilterContext(db, {}, []);
    expect(context.controls).toEqual(db.controls);
    expect(context.remediationStatusFor("f1")).toBe("approved");
    expect(context.clusterFindingIds).toBeUndefined();
  });

  it("narrows to the selected cluster's finding ids", () => {
    const db = emptyDb();
    const context = buildFindingFilterContext(db, { cluster: "c-1" }, [
      { id: "c-1", findingIds: ["f1", "f2"] },
      { id: "c-2", findingIds: ["f9"] },
    ]);
    expect([...context.clusterFindingIds ?? []]).toEqual(["f1", "f2"]);
  });

  it("uses an empty set when the cluster id is unknown", () => {
    const db = emptyDb();
    const context = buildFindingFilterContext(db, { cluster: "missing" }, [
      { id: "c-1", findingIds: ["f1"] },
    ]);
    expect(context.clusterFindingIds?.size).toBe(0);
  });
});
