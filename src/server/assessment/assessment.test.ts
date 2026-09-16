import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import git from "isomorphic-git";

import * as registry from "@complyloop/analysis-core/catalog/registry";
import {
  rgaaControls,
  rgaaFramework,
} from "@complyloop/analysis-core/catalog/rgaa/controls";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { testFinding } from "@/test-fixtures/finding";
import { materializeAssessmentRun } from "@/test-fixtures/materialize-assessment-run";

import { runAssessment, verifyRemediationOnResolve } from "./assessment";
import type { ProjectRows } from "./assessment-pipeline";
import { toPipelineInput } from "./assessment-pipeline";

const BROKEN = `export const Hero = () => <img src="/hero-banner.png" />;\n`;
const FIXED = `export const Hero = () => <img src="/hero-banner.png" alt="Summer sale banner" />;\n`;

let rootPath: string;
let db: WorkspaceSlice;
let project: Project;

beforeEach(() => {
  rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-test-"));
  fs.writeFileSync(path.join(rootPath, "Hero.tsx"), BROKEN);
  project = {
    id: "p1",
    name: "test-project",
    source: "github",
    orgId: "org-test",
    sourceRef: "https://github.com/acme/test-project",
    createdAt: new Date().toISOString(),
  };
  db = {
    organizations: [],
    memberships: [],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
});

afterEach(() => {
  fs.rmSync(rootPath, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function requirementStatus(controlId: string) {
  return db.requirements.find(
    (requirement) => requirement.controlId === controlId,
  )?.status;
}

async function assess(
  options: Parameters<typeof runAssessment>[1] = { rootPath },
) {
  const run = await runAssessment(toPipelineInput(db, project.id), options);
  materializeAssessmentRun(db, run);
  return run;
}

describe("runAssessment", () => {
  it("creates findings, remediations with suggestions, and requirement statuses", async () => {
    const { assessment } = await assess();

    expect(assessment.filesScanned).toBe(1);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].status).toBe("open");
    expect(db.findings[0].explanations[0].provenance).toBe("deterministic");
    expect(db.remediations[0].status).toBe("suggested");
    expect(db.remediations[0].suggestion?.proposedSnippet).toContain("alt=");
    expect(db.remediations[0].suggestion?.provenance).toBe("deterministic");
    expect(requirementStatus("ctl-img-alt")).toBe("failed");
    expect(requirementStatus("ctl-button-name")).toBe("passed");
    expect(requirementStatus("ctl-color-contrast")).toBe("unable_to_verify");
    expect(requirementStatus("ctl-aria-role")).toBe("passed");
    expect(requirementStatus("ctl-image-of-text")).toBe("unable_to_verify");
    expect(
      db.evidence.find((record) => record.kind === "assessment_completed")
        ?.summary,
    ).toMatch(/unable to verify/);
  });

  it("assesses the live Full RGAA preset membership", async () => {
    project.defaultPresetId = "preset-rgaa-full";

    await assess();

    expect(requirementStatus("ctl-video-caption")).toBe("unable_to_verify");
    expect(requirementStatus("ctl-img-alt-relevant")).toBe("unable_to_verify");
    expect(
      db.evidence.find((record) => record.kind === "assessment_completed")
        ?.summary,
    ).toMatch(/unable to verify/);
  });

  it("carries the same finding across re-assessments instead of duplicating it", async () => {
    await assess();
    const originalId = db.findings[0].id;

    await assess();
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].id).toBe(originalId);
    expect(db.findings[0].status).toBe("open");
  });

  it("labels an unchanged-commit re-run as reused instead of scoped", async () => {
    await git.init({ fs, dir: rootPath });
    await git.add({ fs, dir: rootPath, filepath: "Hero.tsx" });
    await git.commit({
      fs,
      dir: rootPath,
      author: { name: "test", email: "test@example.com" },
      message: "init",
    });

    const first = await assess();
    expect(first.assessment.scanMode).toBe("full");
    const second = await assess();
    expect(second.assessment.scanMode).toBe("reused");
    expect(second.filesScanned).toBe(first.filesScanned);
    expect(db.findings).toHaveLength(1);
  });

  it("resolves findings that disappear and detects regressions when they return", async () => {
    await assess();

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    await assess();
    expect(db.findings[0].status).toBe("resolved");
    expect(requirementStatus("ctl-img-alt")).toBe("passed");

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), BROKEN);
    await assess();
    expect(requirementStatus("ctl-img-alt")).toBe("failed");

    const regression = db.evidence.find(
      (record) =>
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    );
    expect(regression).toBeDefined();
  });

  it("verifies a draft-PR remediation from the remediation payload when evidence is empty", async () => {
    await assess();
    const finding = db.findings[0]!;
    const remediation = db.remediations[0]!;
    remediation.status = "approved";
    remediation.approvalAction = "create_draft_pull_request";
    remediation.history.push({
      status: "approved",
      at: new Date().toISOString(),
      note: "Approved by creating a draft pull request",
    });
    db.evidence = [];

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    await assess();

    expect(db.remediations[0]?.status).toBe("verified");
    expect(db.remediations[0]?.history.map((entry) => entry.status)).toEqual(
      expect.arrayContaining(["implemented", "verified"]),
    );
    expect(
      db.evidence.find(
        (record) =>
          record.kind === "remediation_verified" &&
          record.findingId === finding.id,
      )?.detail,
    ).toMatchObject({ determination: "automated" });
  });

  it("does not verify an approved remediation without a draft-PR approval action", async () => {
    await assess();
    const remediation = db.remediations[0]!;
    remediation.status = "approved";
    db.evidence = [];

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    await assess();

    expect(remediation.status).toBe("approved");
  });

  it("does not auto-verify a draft-PR remediation on a preview (non-authoritative) scan", async () => {
    await assess();
    const finding = db.findings[0]!;
    const remediation = db.remediations[0]!;
    remediation.status = "approved";
    remediation.approvalAction = "create_draft_pull_request";
    remediation.history.push({
      status: "approved",
      at: new Date().toISOString(),
      note: "Approved by creating a draft pull request",
    });

    // The fix is present on the scanned ref, so the finding resolves — but
    // because this is a preview scan (non-authoritative), the approved
    // remediation must NOT be auto-verified.
    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    await assess({ rootPath, authoritative: false });

    expect(db.findings.find((row) => row.id === finding.id)?.status).toBe(
      "resolved",
    );
    expect(db.remediations[0]?.status).toBe("approved");
    expect(
      db.remediations[0]?.history.some((entry) => entry.status === "verified"),
    ).toBe(false);
  });

  it("re-opens a dismissed finding when the same instance is re-detected", async () => {
    await assess();
    const originalId = db.findings[0].id;
    db.findings[0].status = "dismissed";
    db.findings[0].dismissal = {
      reason: "accepted_risk",
      note: "Placeholder asset",
      at: new Date().toISOString(),
    };

    await assess();
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].id).toBe(originalId);
    expect(db.findings[0].status).toBe("open");
    expect(
      db.evidence.some(
        (record) =>
          record.findingId === originalId &&
          record.detail?.event === "re-detected",
      ),
    ).toBe(true);
  });

  it("does not overwrite a human requirement exception on re-assessment", async () => {
    await assess();
    const requirement = db.requirements.find(
      (candidate) => candidate.controlId === "ctl-img-alt",
    );
    if (!requirement) throw new Error("expected requirement");
    requirement.status = "not_applicable";
    requirement.determination = "human_review";
    requirement.exception = {
      reason: "not_applicable",
      note: "Out of scope for this release",
      at: new Date().toISOString(),
    };

    await assess();
    expect(requirementStatus("ctl-img-alt")).toBe("not_applicable");
    expect(
      db.requirements.find((candidate) => candidate.controlId === "ctl-img-alt")
        ?.exception?.note,
    ).toBe("Out of scope for this release");
  });

  it("records a snapshot and attributes file changes on re-assessment", async () => {
    const { assessment: first } = await assess();
    expect(first.snapshot?.fileHashes["Hero.tsx"]).toBeDefined();

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    const { assessment: second } = await assess();
    expect(
      second.changesSincePrevious?.some((c) => c.filePath === "Hero.tsx"),
    ).toBe(true);
    expect(
      db.evidence.some(
        (record) => record.kind === "monitoring_changes_detected",
      ),
    ).toBe(true);
  });

  it("clears expired temporary exceptions and re-derives status", async () => {
    await assess();
    const requirement = db.requirements.find(
      (candidate) => candidate.controlId === "ctl-img-alt",
    );
    if (!requirement) throw new Error("expected requirement");
    requirement.determination = "human_review";
    requirement.exception = {
      reason: "temporary",
      note: "Fix landing next sprint",
      at: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
    };

    await assess();
    const refreshed = db.requirements.find(
      (candidate) => candidate.controlId === "ctl-img-alt",
    );
    expect(refreshed?.exception).toBeUndefined();
    expect(refreshed?.status).toBe("failed");
    expect(
      db.evidence.some(
        (record) =>
          record.kind === "requirement_exception_cleared" &&
          record.detail?.expired === true,
      ),
    ).toBe(true);
  });

  it("only assesses controls in the project preset scope", async () => {
    vi.spyOn(registry, "presetById").mockReturnValue({
      id: "preset-test-button-name",
      name: "Button name only",
      description: "test preset",
      frameworkId: rgaaFramework.id,
      controlIds: ["ctl-button-name"],
    });
    project.defaultPresetId = "preset-test-button-name";
    await assess();
    expect(db.findings).toHaveLength(0);
    expect(requirementStatus("ctl-button-name")).toBe("passed");
    expect(requirementStatus("ctl-img-alt")).toBeUndefined();
  });

  it("keeps a human pass on a manual control across re-assessment", async () => {
    const manualControl = {
      id: "ctl-manual",
      frameworkId: rgaaFramework.id,
      code: "CUST-1",
      secondaryCode: "checklist",
      title: "Privacy link present",
      description: "Marketing pages link to the privacy notice",
      checkId: null,
    };
    vi.spyOn(registry, "presetById").mockReturnValue({
      id: "preset-test-manual",
      name: "Manual control only",
      description: "test preset",
      frameworkId: rgaaFramework.id,
      controlIds: ["ctl-manual"],
    });
    project.defaultPresetId = "preset-test-manual";

    await assess({
      rootPath,
      controls: [...rgaaControls, manualControl],
    });
    expect(requirementStatus("ctl-manual")).toBe("unable_to_verify");

    const requirement = db.requirements.find(
      (candidate) => candidate.controlId === "ctl-manual",
    );
    if (!requirement) throw new Error("expected requirement");
    requirement.status = "passed";
    requirement.determination = "human_review";
    requirement.humanPass = {
      note: "Verified on staging footer",
      at: new Date().toISOString(),
    };

    await assess({
      rootPath,
      controls: [...rgaaControls, manualControl],
    });
    expect(requirementStatus("ctl-manual")).toBe("passed");
    expect(
      db.requirements.find((candidate) => candidate.controlId === "ctl-manual")
        ?.humanPass?.note,
    ).toBe("Verified on staging footer");
  });

  it("records per-stage timings on the run and completion evidence", async () => {
    const run = await assess();

    for (const stage of ["changedetection", "ast", "runtime", "reconcile"]) {
      expect(typeof run.stageMs[stage]).toBe("number");
      expect(run.stageMs[stage]).toBeGreaterThanOrEqual(0);
    }
    const completed = db.evidence.find(
      (record) => record.kind === "assessment_completed",
    );
    const detail = completed?.detail as
      | { stageMs?: Record<string, number>; totalMs?: unknown }
      | undefined;
    expect(detail?.stageMs).toEqual(run.stageMs);
    expect(typeof detail?.totalMs).toBe("number");
  });

  it("scoped re-scan does not resolve findings outside changed files", async () => {
    // Narrow the catalog to non-structural checks so the second run stays
    // scoped (structural checks in scope force a full-tree scan).
    const scopedControls = rgaaControls.filter(
      (control) =>
        control.checkId !== "heading-order" &&
        control.checkId !== "list-structure" &&
        control.checkId !== "duplicate-id",
    );
    fs.writeFileSync(path.join(rootPath, "Other.tsx"), BROKEN);
    await assess({ rootPath, controls: scopedControls });
    const otherFinding = db.findings.find(
      (finding) =>
        isSourceLocation(finding.location) &&
        finding.location.filePath === "Other.tsx",
    );
    if (!otherFinding) throw new Error("expected Other.tsx finding");
    expect(otherFinding.status).toBe("open");

    // Only Hero.tsx changes; Other.tsx must stay open under scoped scan.
    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    const { assessment: second } = await assess({
      rootPath,
      controls: scopedControls,
    });
    expect(second.scanMode).toBe("scoped");
    expect(
      db.findings.find(
        (finding) =>
          isSourceLocation(finding.location) &&
          finding.location.filePath === "Other.tsx",
      )?.status,
    ).toBe("open");
    expect(
      db.findings.find(
        (finding) =>
          isSourceLocation(finding.location) &&
          finding.location.filePath === "Hero.tsx",
      )?.status,
    ).toBe("resolved");
  });

  it("returns unable_to_verify for standard controls when no JSX/TSX files are present", async () => {
    // Remove the Hero.tsx file that was created in beforeEach
    fs.unlinkSync(path.join(rootPath, "Hero.tsx"));
    // Create a project with no JSX/TSX files (only .js or .ts files)
    fs.writeFileSync(path.join(rootPath, "script.js"), "console.log('hello');");
    fs.writeFileSync(path.join(rootPath, "types.ts"), "const x: number = 5;");

    const { assessment } = await assess();

    // Verify that zero JSX/TSX files were scanned
    expect(assessment.filesScanned).toBe(0);

    // Verify that standard controls are unable_to_verify (not passed)
    expect(requirementStatus("ctl-button-name")).toBe("unable_to_verify");
    expect(requirementStatus("ctl-img-alt")).toBe("unable_to_verify");
    expect(requirementStatus("ctl-color-contrast")).toBe("unable_to_verify");

    // Verify that the assessment_completed evidence mentions the empty scan
    const completedEvidence = db.evidence.find(
      (record) => record.kind === "assessment_completed",
    );
    expect(completedEvidence).toBeDefined();
    expect(completedEvidence?.summary).toContain("0 files scanned");
  });

  it("forces a full scan when structural checks are in scope", async () => {
    await assess();

    // Only Hero.tsx changes, but the default catalog includes heading-order /
    // list-structure / duplicate-id, so the re-assessment must scan the full
    // tree instead of scoping to the changed file.
    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    const { assessment: second } = await assess();
    expect(second.scanMode).toBe("full");
    expect(
      db.findings.find(
        (finding) =>
          isSourceLocation(finding.location) &&
          finding.location.filePath === "Hero.tsx",
      )?.status,
    ).toBe("resolved");
  });

  it("resolves findings from deleted files and forces a full scan", async () => {
    fs.writeFileSync(path.join(rootPath, "Other.tsx"), BROKEN);
    await assess();
    expect(
      db.findings.filter((finding) => finding.status === "open"),
    ).toHaveLength(2);

    fs.unlinkSync(path.join(rootPath, "Other.tsx"));
    const { assessment: second } = await assess();
    expect(second.scanMode).toBe("full");
    expect(
      db.findings.find(
        (finding) =>
          isSourceLocation(finding.location) &&
          finding.location.filePath === "Other.tsx",
      )?.status,
    ).toBe("resolved");
    // The untouched file's finding survives the full re-scan.
    expect(
      db.findings.find(
        (finding) =>
          isSourceLocation(finding.location) &&
          finding.location.filePath === "Hero.tsx",
      )?.status,
    ).toBe("open");
  });

  it("does not auto-verify a draft-PR remediation when the finding file was not re-scanned", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: new Set(["Other.tsx"]),
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("approved");
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(false);
  });

  it("auto-verifies a draft-PR remediation after a full re-scan", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("verified");
  });

  it("does not auto-verify a draft-PR remediation when sources were reused without a scan", () => {    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: true,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("approved");
  });

  it("does not auto-verify a draft-PR remediation when the finding file was deleted", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    // No fileExists seam: the temp checkout only contains Hero.tsx, so the
    // default existence check proves App.tsx is gone.
    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath,
    });

    expect(rows.remediations[0]?.status).toBe("approved");
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(false);
  });

  it("does not auto-verify when a same-file violation persists in the same run", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    // Same control + same file, still open in this assessment (e.g. the code
    // changed shape instead of being fixed): no positive proof of a fix.
    const sibling = testFinding({
      id: "f2",
      projectId: project.id,
      assessmentId: "a1",
      status: "open" as const,
    });
    const rows: ProjectRows = {
      findings: [finding, sibling],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("approved");
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(false);
  });

  it("auto-verifies when the only same-run sibling is in another file", () => {    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const sibling = testFinding({
      id: "f2",
      projectId: project.id,
      assessmentId: "a1",
      status: "open" as const,
    });
    if (isSourceLocation(sibling.location)) {
      sibling.location.filePath = "Other.tsx";
    }
    const rows: ProjectRows = {
      findings: [finding, sibling],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          approvalAction: "create_draft_pull_request" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("verified");
  });

  it("auto-verifies an approved remediation without a draft-PR approval action", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "approved" as const,
          suggestion: null,
          history: [
            { status: "approved" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    // Approved advances through implemented to verified, with both evidence
    // rows — the proof strength is identical regardless of approval path.
    expect(rows.remediations[0]?.status).toBe("verified");
    expect(
      rows.evidence.some(
        (record) => record.kind === "remediation_implemented",
      ),
    ).toBe(true);
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(true);
  });

  it("auto-verifies an implemented remediation with only the verified evidence", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "implemented" as const,
          suggestion: null,
          history: [
            { status: "implemented" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("verified");
    expect(
      rows.evidence.some(
        (record) => record.kind === "remediation_implemented",
      ),
    ).toBe(false);
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(true);
  });

  it("does not auto-verify a remediation still at the suggestion stage", () => {
    const finding = testFinding({
      projectId: project.id,
      assessmentId: "a0",
    });
    const rows: ProjectRows = {
      findings: [finding],
      remediations: [
        {
          id: "r1",
          findingId: finding.id,
          status: "suggested" as const,
          suggestion: null,
          history: [
            { status: "suggested" as const, at: new Date().toISOString() },
          ],
        },
      ],
      requirements: [],
      evidence: [],
    };

    verifyRemediationOnResolve(rows, finding, "a1", {
      scopedFileSet: null,
      sourcesUnchanged: false,
      rootPath: "test-root",
      fileExists: () => true,
    });

    expect(rows.remediations[0]?.status).toBe("suggested");
    expect(
      rows.evidence.some((record) => record.kind === "remediation_verified"),
    ).toBe(false);
  });
});
