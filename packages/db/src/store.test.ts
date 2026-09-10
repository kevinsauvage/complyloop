import { describe, expect, it } from "vitest";

import { newEvidenceRecord } from "./repo/mappers";
import {
  evidenceToRow,
  rowToEvidence,
} from "./repo/mappers";
import { emptyDb } from "./types";

describe("emptyDb evidence append", () => {
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
    db.evidence.push(newEvidenceRecord({
      kind: "project_connected",
      summary: "connected",
      projectId: "p1",
    }));
    db.evidence.push(newEvidenceRecord({
      kind: "assessment_completed",
      summary: "done",
      projectId: "p1",
    }));

    expect(db.projects).toHaveLength(1);
    expect(db.evidence).toHaveLength(2);
    expect(db.evidence[0]!.id).toBeTruthy();
    expect(db.evidence[0]!.at).toBeTruthy();
    expect(db.evidence[1]!.kind).toBe("assessment_completed");
    expect(db.evidence.map((record) => record.summary)).toEqual([
      "connected",
      "done",
    ]);
  });
});

describe("evidence row mapping", () => {
  it("round-trips optional ids and detail", () => {
    const record = {
      id: "e3",
      at: "2026-01-03T00:00:00.000Z",
      kind: "finding" as const,
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
