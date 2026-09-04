import { describe, expect, it } from "vitest";
import { addEvidence, emptyDb } from "../db";
import {
  evidenceRecordsToInsert,
  evidenceToRow,
  rowToEvidence,
} from "./postgres-evidence";

describe("emptyDb + addEvidence", () => {
  it("starts empty and appends evidence records", () => {
    const db = emptyDb();
    expect(db.projects).toEqual([]);
    expect(db.evidence).toEqual([]);

    db.projects.push({
      id: "p1",
      name: "demo",
      source: "github",
      orgId: "org-test",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const first = addEvidence(db, {
      kind: "project_connected",
      summary: "connected",
      projectId: "p1",
    });
    const second = addEvidence(db, {
      kind: "assessment_completed",
      summary: "done",
      projectId: "p1",
    });

    expect(db.projects).toHaveLength(1);
    expect(db.evidence).toHaveLength(2);
    expect(first.id).toBeTruthy();
    expect(first.at).toBeTruthy();
    expect(second.kind).toBe("assessment_completed");
    expect(db.evidence.map((record) => record.summary)).toEqual([
      "connected",
      "done",
    ]);
  });
});

describe("evidenceRecordsToInsert", () => {
  it("only returns ids not already stored (append-only)", () => {
    const records = [
      {
        id: "e1",
        at: "2026-01-01T00:00:00.000Z",
        kind: "assessment_completed" as const,
        summary: "one",
      },
      {
        id: "e2",
        at: "2026-01-02T00:00:00.000Z",
        kind: "assessment_completed" as const,
        summary: "two",
      },
    ];
    expect(evidenceRecordsToInsert(records, new Set(["e1"]))).toEqual([
      records[1],
    ]);
    expect(evidenceRecordsToInsert(records, new Set(["e1", "e2"]))).toEqual([]);
  });
});

describe("evidence row mapping", () => {
  it("round-trips optional ids and detail", () => {
    const record = {
      id: "e3",
      at: "2026-01-03T00:00:00.000Z",
      kind: "finding_detected" as const,
      summary: "mapped",
      projectId: "p1",
      controlId: "c1",
      findingId: "f1",
      assessmentId: "a1",
      detail: { engine: "ast" },
    };
    const row = evidenceToRow(record);
    expect(row.projectId).toBe("p1");
    expect(row.detail).toEqual({ engine: "ast" });
    expect(rowToEvidence(row)).toEqual(record);
  });

  it("maps missing optional columns to undefined / null", () => {
    const record = {
      id: "e4",
      at: "2026-01-04T00:00:00.000Z",
      kind: "assessment_completed" as const,
      summary: "bare",
    };
    expect(evidenceToRow(record)).toMatchObject({
      projectId: null,
      controlId: null,
      findingId: null,
      assessmentId: null,
      detail: null,
    });
    expect(rowToEvidence(evidenceToRow(record))).toEqual(record);
  });
});
