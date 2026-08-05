import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addEvidence, isPostgresConfigured, loadDb, saveDb } from "../db";
import { emptyDb, loadDbFromJson, saveDbToJson } from "./json";
import { evidenceRecordsToInsert } from "./postgres";

describe("JSON store", () => {
  let dir: string;
  const previous = process.env.DATA_DIR;
  const previousUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-json-"));
    process.env.DATA_DIR = dir;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it("round-trips through loadDb/saveDb when DATABASE_URL is unset", async () => {
    expect(isPostgresConfigured()).toBe(false);
    const db = emptyDb();
    db.activeProjectId = "p1";
    db.projects.push({
      id: "p1",
      name: "demo",
      rootPath: "/tmp/demo",
      source: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    addEvidence(db, {
      kind: "project_connected",
      summary: "connected",
      projectId: "p1",
    });
    await saveDb(db);

    const loaded = await loadDb();
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.evidence).toHaveLength(1);
    expect(loaded.evidence[0].kind).toBe("project_connected");
  });

  it("saveDbToJson / loadDbFromJson preserve evidence appends", () => {
    const db = emptyDb();
    addEvidence(db, { kind: "assessment_completed", summary: "a1" });
    addEvidence(db, { kind: "assessment_completed", summary: "a2" });
    saveDbToJson(db);
    const loaded = loadDbFromJson();
    expect(loaded.evidence.map((e) => e.summary)).toEqual(["a1", "a2"]);
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
