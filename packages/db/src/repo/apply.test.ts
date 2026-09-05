import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Requirement } from "@complyloop/domain/project-types";

const insertAssessment = vi.hoisted(() => vi.fn());
const insertAlerts = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());
const upsertRequirements = vi.hoisted(() => vi.fn());
const upsertFindings = vi.hoisted(() => vi.fn());
const upsertRemediations = vi.hoisted(() => vi.fn());

vi.mock("./requirements.ts", () => ({ upsertRequirements }));
vi.mock("./findings.ts", () => ({ upsertFindings }));
vi.mock("./remediations.ts", () => ({ upsertRemediations }));
vi.mock("./alerts.ts", () => ({ insertAlerts }));
vi.mock("./evidence.ts", () => ({ insertEvidenceRecords }));
vi.mock("./assessments.ts", () => ({ insertAssessment }));

import type { DrizzleDb } from "../client.ts";
import {
  applyAssessmentPayload,
  buildAssessmentApplyPayload,
  changedEntities,
  entityMap,
  persistProjectSliceDiff,
  persistTargetedProjectWrite,
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

describe("changedEntities", () => {
  it("returns items that are new or whose canonical JSON differs", () => {
    const before = entityMap([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    expect(
      changedEntities(before, [
        { id: "a", n: 1 },
        { id: "b", n: 3 },
        { id: "c", n: 4 },
      ]),
    ).toEqual([
      { id: "b", n: 3 },
      { id: "c", n: 4 },
    ]);
  });

  it("treats key-order-stable clones as unchanged", () => {
    const before = entityMap([requirement]);
    expect(changedEntities(before, [{ ...requirement }])).toEqual([]);
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

  it("writes assessment rows and diffs only changed entities", async () => {
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
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRequirements).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, []);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, evidence);
  });

  it("no-ops entity upserts when the loaded slice is unchanged", async () => {
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

    expect(upsertRequirements).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(upsertFindings).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map(),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, []);
  });
});

describe("persistTargetedProjectWrite", () => {
  const tx = { kind: "tx" } as unknown as DrizzleDb;

  beforeEach(() => {
    vi.clearAllMocks();
    upsertRequirements.mockResolvedValue(undefined);
    upsertFindings.mockResolvedValue(undefined);
    upsertRemediations.mockResolvedValue(undefined);
    insertAlerts.mockResolvedValue(undefined);
    insertEvidenceRecords.mockResolvedValue(undefined);
  });

  it("upserts only the provided rows", async () => {
    const evidence: EvidenceRecord[] = [
      {
        id: "ev-1",
        at: "2026-01-02T00:00:00.000Z",
        kind: "finding_dismissed",
        summary: "dismissed",
        projectId,
        findingId: finding.id,
      },
    ];
    await persistTargetedProjectWrite(
      tx,
      {
        findings: [finding],
        remediations: [remediation],
        requirements: [requirement],
        alerts: [alert],
        evidence,
      },
      {
        loadedRequirementUpdatedAtById: new Map([
          [requirement.id, requirement.updatedAt],
        ]),
        loadedFindingUpdatedAtById: new Map([[finding.id, "2026-01-01"]]),
        loadedRemediationUpdatedAtById: new Map([[remediation.id, "2026-01-01"]]),
      },
    );

    expect(upsertFindings).toHaveBeenCalledWith(tx, [finding], {
      loadedUpdatedAtById: new Map([[finding.id, "2026-01-01"]]),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [remediation], {
      loadedUpdatedAtById: new Map([[remediation.id, "2026-01-01"]]),
    });
    expect(upsertRequirements).toHaveBeenCalledWith(tx, [requirement], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, [alert]);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, evidence);
  });

  it("no-ops when the payload is empty", async () => {
    await persistTargetedProjectWrite(tx, {});
    expect(upsertFindings).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: undefined,
    });
    expect(upsertRequirements).toHaveBeenCalledWith(tx, [], {});
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, []);
  });
});

describe("persistProjectSliceDiff", () => {
  const tx = { kind: "tx" } as unknown as DrizzleDb;

  beforeEach(() => {
    vi.clearAllMocks();
    upsertRequirements.mockResolvedValue(undefined);
    upsertFindings.mockResolvedValue(undefined);
    upsertRemediations.mockResolvedValue(undefined);
    insertAlerts.mockResolvedValue(undefined);
    insertEvidenceRecords.mockResolvedValue(undefined);
  });

  it("no-ops entity upserts when the slice is unchanged", async () => {
    const slice = {
      requirements: [requirement],
      findings: [finding],
      remediations: [remediation],
      alerts: [alert],
    };

    await persistProjectSliceDiff(tx, slice, slice, []);

    expect(upsertRequirements).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
    });
    expect(upsertFindings).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [], {
      loadedUpdatedAtById: new Map(),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, []);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, []);
  });

  it("persists only changed entities and new evidence", async () => {
    const before = {
      requirements: [requirement],
      findings: [finding],
      remediations: [remediation],
      alerts: [alert],
    };
    const updatedFinding = { ...finding, status: "dismissed" as const };
    const updatedRemediation = { ...remediation, status: "approved" as const };
    const readAlert = { ...alert, read: true };
    const updatedRequirement = {
      ...requirement,
      status: "passed" as const,
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const after = {
      requirements: [updatedRequirement],
      findings: [updatedFinding],
      remediations: [updatedRemediation],
      alerts: [readAlert],
    };
    const evidence: EvidenceRecord[] = [
      {
        id: "ev-1",
        at: "2026-01-02T00:00:00.000Z",
        kind: "finding_dismissed",
        summary: "dismissed",
        projectId,
        findingId: finding.id,
      },
    ];

    await persistProjectSliceDiff(tx, before, after, evidence);

    expect(upsertRequirements).toHaveBeenCalledWith(
      tx,
      [updatedRequirement],
      {
        loadedUpdatedAtById: new Map([[requirement.id, requirement.updatedAt]]),
      },
    );
    expect(upsertFindings).toHaveBeenCalledWith(tx, [updatedFinding], {
      loadedUpdatedAtById: new Map(),
    });
    expect(upsertRemediations).toHaveBeenCalledWith(tx, [updatedRemediation], {
      loadedUpdatedAtById: new Map(),
    });
    expect(insertAlerts).toHaveBeenCalledWith(tx, [readAlert]);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(tx, evidence);
  });
});
