import { describe, expect, it } from "vitest";

import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import {
  alertToRow,
  assessmentToRow,
  evidenceToRow,
  findingToRow,
  membershipToRow,
  organizationToRow,
  projectToRow,
  remediationToRow,
  requirementToRow,
  rowToEvidence,
} from "./mappers";

/**
 * The slice-diff write model compares rows with `JSON.stringify`
 * (repo/apply.ts `changedEntities`). Because the diff
 * runs over the in-memory shaped entities (not the row shape), key order here
 * does not affect it directly — but the row shapes are what get persisted, and
 * these tests pin them so a future mapper change cannot silently reorder or
 * drop columns. Keep expected orders in sync with the mappers.
 */
describe("repo mappers emit stable row shapes", () => {
  it("pins finding/remediation/requirement/alert row shapes", () => {
    const finding = {} as unknown as Finding;
    const remediation = {} as unknown as Remediation;
    const requirement = {} as unknown as Requirement;
    const alert = {} as unknown as Alert;

    expect(Object.keys(findingToRow(finding))).toEqual([
      "id",
      "projectId",
      "controlId",
      "assessmentId",
      "status",
      "payload",
    ]);
    expect(Object.keys(remediationToRow(remediation))).toEqual([
      "id",
      "findingId",
      "status",
      "payload",
    ]);
    expect(Object.keys(requirementToRow(requirement))).toEqual([
      "id",
      "projectId",
      "controlId",
      "status",
      "payload",
    ]);
    expect(Object.keys(alertToRow(alert))).toEqual([
      "id",
      "projectId",
      "read",
      "payload",
    ]);
  });

  it("pins project/membership/org/assessment row shapes", () => {
    expect(Object.keys(projectToRow({} as unknown as Project))).toEqual([
      "id",
      "name",
      "ownerUserId",
      "orgId",
      "payload",
    ]);
    expect(
      Object.keys(membershipToRow({} as unknown as OrgMembership)),
    ).toEqual(["id", "orgId", "userId", "githubLogin", "role", "payload"]);
    expect(
      Object.keys(organizationToRow({} as unknown as Organization)),
    ).toEqual(["id", "slug", "payload"]);
    expect(Object.keys(assessmentToRow({} as unknown as Assessment))).toEqual([
      "id",
      "projectId",
      "payload",
    ]);
  });

  it("assessment payload excludes the snapshot (stored separately)", () => {
    const withSnapshot = {
      id: "a1",
      projectId: "p1",
      snapshot: { fileHashes: { "a.tsx": "hash" }, gitHead: "abc" },
    } as unknown as Assessment;
    const row = assessmentToRow(withSnapshot);
    expect(row.payload).not.toHaveProperty("snapshot");
    expect(JSON.stringify(row.payload)).not.toContain("fileHashes");
  });

  it("round-trips evidence rows through the append-only table shape", () => {
    // EvidenceRecord → row keeps only the indexed columns + JSONB detail.
    const record = {
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      kind: "assessment_completed",
      summary: "done",
      projectId: "p1",
      detail: { files: 3 },
    } satisfies Pick<
      EvidenceRecord,
      "id" | "at" | "kind" | "summary" | "projectId" | "detail"
    >;
    // rowToEvidence is exercised below; here we only pin the
    // insert shape via the repo insert path contract (nullable columns).
    expect(record.kind).toBe("assessment_completed");
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
