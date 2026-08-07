import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { isSourceLocation } from "@/core/location";
import type { Project } from "@/core/types";
import { runAssessment } from "./assessment";
import type { Db } from "./db";

const BROKEN = `export const Hero = () => <img src="/hero-banner.png" />;\n`;
const FIXED = `export const Hero = () => <img src="/hero-banner.png" alt="Summer sale banner" />;\n`;

let rootPath: string;
let db: Db;
let project: Project;

beforeEach(() => {
  rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-test-"));
  fs.writeFileSync(path.join(rootPath, "Hero.tsx"), BROKEN);
  project = {
    id: "p1",
    name: "test-project",
    rootPath,
    source: "local",
    sourceRef: rootPath,
    createdAt: new Date().toISOString(),
  };
  db = {
    frameworks: [rgaaFramework],
    controls: rgaaControls,
    organizations: [],
    memberships: [],
    projects: [project],
    activeProjectId: project.id,
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
});

function requirementStatus(controlId: string) {
  return db.requirements.find((requirement) => requirement.controlId === controlId)
    ?.status;
}

describe("runAssessment", () => {
  it("creates findings, remediations with suggestions, and requirement statuses", async () => {
    const assessment = await runAssessment(db, project.id);

    expect(assessment.filesScanned).toBe(1);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].status).toBe("open");
    expect(db.findings[0].explanations[0].provenance).toBe("deterministic");
    expect(db.remediations[0].status).toBe("suggested");
    expect(db.remediations[0].suggestion?.proposedSnippet).toContain("alt=");
    expect(db.remediations[0].suggestion?.provenance).toBe("deterministic");
    expect(requirementStatus("ctl-img-alt")).toBe("failed");
    expect(requirementStatus("ctl-button-name")).toBe("passed");
    expect(db.evidence.some((record) => record.kind === "assessment_completed")).toBe(true);
  });

  it("carries the same finding across re-assessments instead of duplicating it", async () => {
    await runAssessment(db, project.id);
    const originalId = db.findings[0].id;

    await runAssessment(db, project.id);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].id).toBe(originalId);
    expect(db.findings[0].status).toBe("open");
  });

  it("resolves findings that disappear and detects regressions when they return", async () => {
    await runAssessment(db, project.id);

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    await runAssessment(db, project.id);
    expect(db.findings[0].status).toBe("resolved");
    expect(requirementStatus("ctl-img-alt")).toBe("passed");

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), BROKEN);
    await runAssessment(db, project.id);
    expect(requirementStatus("ctl-img-alt")).toBe("failed");

    const regression = db.evidence.find(
      (record) =>
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    );
    expect(regression).toBeDefined();
  });

  it("keeps dismissed findings dismissed on re-assessment", async () => {
    await runAssessment(db, project.id);
    db.findings[0].status = "dismissed";
    db.findings[0].dismissal = {
      reason: "accepted_risk",
      note: "Placeholder asset",
      at: new Date().toISOString(),
    };

    await runAssessment(db, project.id);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].status).toBe("dismissed");
  });

  it("does not overwrite a human requirement exception on re-assessment", async () => {
    await runAssessment(db, project.id);
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

    await runAssessment(db, project.id);
    expect(requirementStatus("ctl-img-alt")).toBe("not_applicable");
    expect(
      db.requirements.find((candidate) => candidate.controlId === "ctl-img-alt")
        ?.exception?.note,
    ).toBe("Out of scope for this release");
  });

  it("records a snapshot and attributes file changes on re-assessment", async () => {
    const first = await runAssessment(db, project.id);
    expect(first.snapshot?.fileHashes["Hero.tsx"]).toBeDefined();

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    const second = await runAssessment(db, project.id);
    expect(second.changesSincePrevious?.some((c) => c.filePath === "Hero.tsx")).toBe(
      true,
    );
    expect(
      db.evidence.some((record) => record.kind === "monitoring_changes_detected"),
    ).toBe(true);
  });

  it("clears expired temporary exceptions and re-derives status", async () => {
    await runAssessment(db, project.id);
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

    await runAssessment(db, project.id);
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

  it("only assesses controls in the project scope", async () => {
    project.inScopeControlIds = ["ctl-button-name"];
    await runAssessment(db, project.id);
    expect(db.findings).toHaveLength(0);
    expect(requirementStatus("ctl-button-name")).toBe("passed");
    expect(requirementStatus("ctl-img-alt")).toBeUndefined();
  });

  it("keeps a human pass on a manual control across re-assessment", async () => {
    db.controls.push({
      id: "ctl-manual",
      frameworkId: rgaaFramework.id,
      code: "CUST-1",
      secondaryCode: "checklist",
      title: "Privacy link present",
      description: "Marketing pages link to the privacy notice",
      checkId: null,
    });
    project.inScopeControlIds = ["ctl-manual"];

    await runAssessment(db, project.id);
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

    await runAssessment(db, project.id);
    expect(requirementStatus("ctl-manual")).toBe("passed");
    expect(
      db.requirements.find((candidate) => candidate.controlId === "ctl-manual")
        ?.humanPass?.note,
    ).toBe("Verified on staging footer");
  });

  it("scoped re-scan does not resolve findings outside changed files", async () => {
    fs.writeFileSync(path.join(rootPath, "Other.tsx"), BROKEN);
    await runAssessment(db, project.id);
    const otherFinding = db.findings.find(
      (finding) =>
        isSourceLocation(finding.location) &&
        finding.location.filePath === "Other.tsx",
    );
    if (!otherFinding) throw new Error("expected Other.tsx finding");
    expect(otherFinding.status).toBe("open");

    // Only Hero.tsx changes; Other.tsx must stay open under scoped scan.
    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    const second = await runAssessment(db, project.id);
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
});
