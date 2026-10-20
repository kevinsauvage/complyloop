import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

const insertAssessment = vi.hoisted(() => vi.fn());
const upsertAlerts = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());
const upsertRequirements = vi.hoisted(() => vi.fn());
const upsertFindings = vi.hoisted(() => vi.fn());
const upsertRemediations = vi.hoisted(() => vi.fn());

vi.mock("./requirements.ts", () => ({ upsertRequirements }));
vi.mock("./findings.ts", () => ({ upsertFindings }));
vi.mock("./remediations.ts", () => ({ upsertRemediations }));
vi.mock("./alerts.ts", () => ({ upsertAlerts }));
vi.mock("./evidence.ts", () => ({ insertEvidenceRecords }));
vi.mock("./assessments.ts", () => ({ insertAssessment }));

import type { DrizzleDb } from "../postgres.ts";
import {
  applyAssessmentPayload,
  projectScopedSlice,
  type ProjectSlice,
} from "./apply.ts";

const projectId = "p1";
const requirement: Requirement = {
  id: "req-1",
  projectId,
  controlId: "c1",
  status: "failed",
  determination: "automated",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const finding: Finding = {
  id: "f1",
  projectId,
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  kind: "violation",
  status: "open",
  severity: "serious",
  confidence: "high",
  reason: "Missing alt",
  location: {
    kind: "source",
    filePath: "App.tsx",
    line: 1,
    column: 1,
    snippet: '<img src="x" />',
    span: { start: 0, end: 16 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};
const remediation: Remediation = {
  id: "r1",
  findingId: finding.id,
  status: "suggested",
  suggestion: null,
  history: [],
};
const alert: Alert = {
  id: "alert-1",
  projectId,
  kind: "compliance_regression",
  summary: "regression",
  at: "2026-01-01T00:00:00.000Z",
  read: false,
};
const assessment: Assessment = {
  id: "a2",
  projectId,
  startedAt: "2026-01-02T00:00:00.000Z",
  completedAt: "2026-01-02T00:01:00.000Z",
  filesScanned: 3,
  summary: {
    passed: 0,
    failed: 1,
    needs_review: 0,
    not_applicable: 0,
    unable_to_verify: 0,
  },
};
const snapshot: AssessmentSnapshot = { fileHashes: { "App.tsx": "h1" } };
const evidence: EvidenceRecord = {
  id: "e1",
  at: "2026-01-02T00:01:00.000Z",
  kind: "assessment_completed",
  summary: "done",
  projectId,
};

const tx = { kind: "tx" } as unknown as DrizzleDb;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("projectScopedSlice", () => {
  it("scopes runtime rows to the project and its findings' remediations", () => {
    const slice = projectScopedSlice(
      {
        findings: [finding, { ...finding, id: "f-other", projectId: "p2" }],
        remediations: [
          remediation,
          { ...remediation, id: "r-other", findingId: "f-other" },
        ],
        requirements: [
          requirement,
          { ...requirement, id: "req-2", projectId: "p2" },
        ],
        alerts: [alert, { ...alert, id: "alert-2", projectId: "p2" }],
      },
      projectId,
    );

    expect(slice.findings).toEqual([finding]);
    expect(slice.remediations).toEqual([remediation]);
    expect(slice.requirements).toEqual([requirement]);
    expect(slice.alerts).toEqual([alert]);
  });
});

describe("applyAssessmentPayload", () => {
  const baseline: ProjectSlice = {
    findings: [structuredClone(finding)],
    remediations: [structuredClone(remediation)],
    requirements: [structuredClone(requirement)],
    alerts: [],
  };

  it("inserts the assessment and rewrites only rows that changed", async () => {
    const nextFinding: Finding = { ...finding, status: "resolved" };

    await applyAssessmentPayload(
      tx,
      {
        assessment,
        snapshot,
        evidence: [evidence],
        findings: [nextFinding],
        remediations: [remediation],
        requirements: [requirement],
        alerts: [alert],
      },
      { baseline },
    );

    expect(insertAssessment).toHaveBeenCalledWith(tx, assessment, snapshot);
    expect(upsertFindings).toHaveBeenCalledWith(tx, [nextFinding]);
    expect(upsertRemediations).toHaveBeenCalledWith(tx, []);
    expect(upsertRequirements).toHaveBeenCalledWith(tx, []);
    expect(upsertAlerts).toHaveBeenCalledWith(tx, [alert]);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, [evidence]);
  });

  it("ignores updatedAt when deciding a row is unchanged", async () => {
    const restamped: Requirement = {
      ...requirement,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };

    await applyAssessmentPayload(
      tx,
      {
        assessment,
        snapshot,
        evidence: [],
        findings: [finding],
        remediations: [remediation],
        requirements: [restamped],
        alerts: [],
      },
      { baseline },
    );

    expect(upsertRequirements).toHaveBeenCalledWith(tx, []);
  });
});
