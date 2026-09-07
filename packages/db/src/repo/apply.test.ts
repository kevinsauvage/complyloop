import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert, Assessment, EvidenceRecord, Finding, Remediation } from "../types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

const insertAssessment = vi.hoisted(() => vi.fn());
const insertAlerts = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());
const upsertRequirements = vi.hoisted(() => vi.fn());
const upsertFindings = vi.hoisted(() => vi.fn());
const upsertRemediations = vi.hoisted(() => vi.fn());

const updateProject = vi.hoisted(() => vi.fn());

vi.mock("./requirements.ts", () => ({ upsertRequirements }));
vi.mock("./findings.ts", () => ({ upsertFindings }));
vi.mock("./remediations.ts", () => ({ upsertRemediations }));
vi.mock("./alerts.ts", () => ({ insertAlerts }));
vi.mock("./evidence.ts", () => ({ insertEvidenceRecords }));
vi.mock("./assessments.ts", () => ({ insertAssessment }));
vi.mock("./projects.ts", () => ({ updateProject }));

import type { DrizzleDb } from "../client.ts";
import {
  applyAssessmentPayload,
  buildAssessmentApplyPayload,
  persistProjectRows,
  snapshotProjectSlice,
  updatedAtById,
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

describe("updatedAtById", () => {
  it("keeps only entities that already have updatedAt", () => {
    expect(
      updatedAtById([
        { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "b" },
      ]),
    ).toEqual(new Map([["a", "2026-01-01T00:00:00.000Z"]]));
  });
});

describe("snapshotProjectSlice", () => {
  it("scopes runtime rows to the active project and linked remediations", () => {
    const otherFinding: Finding = { ...finding, id: "f-other", projectId: "p2" };
    const slice = snapshotProjectSlice(
      [requirement, { ...requirement, id: "req-2", projectId: "p2" }],
      [finding, otherFinding],
      [remediation, { ...remediation, id: "r-other", findingId: "f-other" }],
      [alert, { ...alert, id: "alert-2", projectId: "p2" }],
      projectId,
    );

    expect(slice.requirements).toEqual([requirement]);
    expect(slice.findings).toEqual([finding]);
    expect(slice.remediations).toEqual([remediation]);
    expect(slice.alerts).toEqual([alert]);
  });

  // P0 regression: the worker snapshots the loaded slice for stale-write guards,
  // then runAssessment mutates the SAME object references in place.
  it("captures pre-scan updatedAt values even when source rows are mutated in place afterwards", async () => {
    const liveRequirement: Requirement = structuredClone(requirement);
    const liveFinding: Finding = structuredClone(finding);
    const liveRemediation: Remediation = structuredClone(remediation);

    const loadedSlice = snapshotProjectSlice(
      [liveRequirement],
      [liveFinding],
      [liveRemediation],
      [],
      projectId,
    );

    liveRequirement.status = "passed";
    liveRequirement.updatedAt = "2026-01-02T00:00:00.000Z";
    liveFinding.status = "resolved";
    liveFinding.assessmentId = "a2";

    const tx = { kind: "tx" } as unknown as DrizzleDb;
    upsertRequirements.mockResolvedValue(undefined);
    upsertFindings.mockResolvedValue(undefined);
    upsertRemediations.mockResolvedValue(undefined);
    insertAlerts.mockResolvedValue(undefined);
    insertEvidenceRecords.mockResolvedValue(undefined);

    await persistProjectRows(
      tx,
      {
        requirements: [liveRequirement],
        findings: [liveFinding],
        remediations: [liveRemediation],
        alerts: [],
      },
      { loadedSlice },
    );

    expect(upsertRequirements).toHaveBeenCalledWith(tx, [liveRequirement], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(upsertFindings).toHaveBeenCalledWith(tx, [liveFinding], {
      loadedUpdatedAtById: new Map(),
    });
  });
});

describe("buildAssessmentApplyPayload", () => {
  it("filters findings, remediations, requirements, and alerts to the assessment project", () => {
    const assessment: Assessment = {
      id: "a1",
      projectId,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      filesScanned: 1,
      summary: {
        passed: 0,
        failed: 1,
        needs_review: 0,
        not_applicable: 0,
        unable_to_verify: 0,
      },
      snapshot: { fileHashes: {} },
    };
    const payload = buildAssessmentApplyPayload({
      assessment,
      snapshot: assessment.snapshot!,
      evidence: [],
      findings: [finding, { ...finding, id: "f2", projectId: "p2" }],
      remediations: [remediation],
      requirements: [requirement],
      alerts: [alert],
    });

    expect(payload.findings).toEqual([finding]);
    expect(payload.remediations).toEqual([remediation]);
    expect(payload.requirements).toEqual([requirement]);
    expect(payload.alerts).toEqual([alert]);
  });
});

describe("applyAssessmentPayload", () => {
  const tx = { kind: "tx" } as unknown as DrizzleDb;
  const loadedSlice = {
    requirements: [requirement],
    findings: [finding],
    remediations: [remediation],
    alerts: [alert],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    insertAssessment.mockResolvedValue(undefined);
    upsertFindings.mockResolvedValue(undefined);
    upsertRemediations.mockResolvedValue(undefined);
    upsertRequirements.mockResolvedValue(undefined);
    insertAlerts.mockResolvedValue(undefined);
    insertEvidenceRecords.mockResolvedValue(undefined);
  });

  it("writes assessment rows and upserts the project slice with stale guards", async () => {
    const assessment: Assessment = {
      id: "a1",
      projectId,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      filesScanned: 1,
      summary: {
        passed: 0,
        failed: 1,
        needs_review: 0,
        not_applicable: 0,
        unable_to_verify: 0,
      },
      snapshot: { fileHashes: {} },
    };
    const evidence: EvidenceRecord[] = [
      {
        id: "ev-1",
        at: "2026-01-01T00:00:00.000Z",
        kind: "assessment_completed",
        summary: "done",
        projectId,
      },
    ];
    const updatedFinding = { ...finding, status: "dismissed" as const };

    await applyAssessmentPayload(
      tx,
      {
        assessment,
        snapshot: assessment.snapshot!,
        evidence,
        findings: [updatedFinding],
        remediations: [remediation],
        requirements: [requirement],
        alerts: [],
      },
      { loadedSlice },
    );

    expect(insertAssessment).toHaveBeenCalledWith(
      tx,
      assessment,
      assessment.snapshot,
    );
    expect(upsertFindings).toHaveBeenCalledWith(tx, [updatedFinding], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [remediation], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRequirements).toHaveBeenCalledWith(tx, [requirement], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, []);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, evidence);
  });

  it("upserts the full loaded slice even when values are unchanged", async () => {
    const assessment: Assessment = {
      id: "a2",
      projectId,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      filesScanned: 0,
      summary: {
        passed: 0,
        failed: 0,
        needs_review: 0,
        not_applicable: 0,
        unable_to_verify: 0,
      },
      snapshot: { fileHashes: {} },
    };

    await applyAssessmentPayload(
      tx,
      {
        assessment,
        snapshot: assessment.snapshot!,
        evidence: [],
        findings: loadedSlice.findings,
        remediations: loadedSlice.remediations,
        requirements: loadedSlice.requirements,
        alerts: [],
      },
      { loadedSlice },
    );

    expect(upsertRequirements).toHaveBeenCalledWith(tx, loadedSlice.requirements, {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(upsertFindings).toHaveBeenCalledWith(tx, loadedSlice.findings, {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, loadedSlice.remediations, {
      loadedUpdatedAtById: new Map(),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, []);
  });
});

describe("persistProjectRows", () => {
  const tx = { kind: "tx" } as unknown as DrizzleDb;
  const evidence: EvidenceRecord[] = [
    {
      id: "ev-1",
      at: "2026-01-02T00:00:00.000Z",
      kind: "finding",
      summary: "dismissed",
      projectId,
      findingId: finding.id,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    upsertRequirements.mockResolvedValue(undefined);
    upsertFindings.mockResolvedValue(undefined);
    upsertRemediations.mockResolvedValue(undefined);
    insertAlerts.mockResolvedValue(undefined);
    insertEvidenceRecords.mockResolvedValue(undefined);
    updateProject.mockResolvedValue(undefined);
  });

  it("upserts only provided rows and forwards stale guards", async () => {
    await persistProjectRows(
      tx,
      {
        findings: [finding],
        remediations: [remediation],
        requirements: [requirement],
        alerts: [alert],
        evidence,
      },
      {
        loadedSlice: {
          findings: [{ ...finding, updatedAt: "2026-01-01" }],
          remediations: [{ ...remediation, updatedAt: "2026-01-01" }],
          requirements: [requirement],
        },
      },
    );
    expect(upsertFindings).toHaveBeenCalledWith(tx, [finding], {
      loadedUpdatedAtById: new Map([[finding.id, "2026-01-01"]]),
    });
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("no-ops when the payload is empty", async () => {
    await persistProjectRows(tx, {});
    expect(upsertFindings).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: undefined,
    });
    expect(updateProject).not.toHaveBeenCalled();
  });
});
