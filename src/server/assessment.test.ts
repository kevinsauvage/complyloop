import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
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
    createdAt: new Date().toISOString(),
  };
  db = {
    frameworks: [rgaaFramework],
    controls: rgaaControls,
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
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
  it("creates findings, remediations with suggestions, and requirement statuses", () => {
    const assessment = runAssessment(db, project.id);

    expect(assessment.filesScanned).toBe(1);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].status).toBe("open");
    expect(db.findings[0].explanations[0].provenance).toBe("deterministic");
    expect(db.remediations[0].status).toBe("suggested");
    expect(db.remediations[0].suggestion?.proposedSnippet).toContain("alt=");
    expect(requirementStatus("ctl-img-alt")).toBe("failed");
    expect(requirementStatus("ctl-button-name")).toBe("passed");
    expect(db.evidence.some((record) => record.kind === "assessment_completed")).toBe(true);
  });

  it("carries the same finding across re-assessments instead of duplicating it", () => {
    runAssessment(db, project.id);
    const originalId = db.findings[0].id;

    runAssessment(db, project.id);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].id).toBe(originalId);
    expect(db.findings[0].status).toBe("open");
  });

  it("resolves findings that disappear and detects regressions when they return", () => {
    runAssessment(db, project.id);

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), FIXED);
    runAssessment(db, project.id);
    expect(db.findings[0].status).toBe("resolved");
    expect(requirementStatus("ctl-img-alt")).toBe("passed");

    fs.writeFileSync(path.join(rootPath, "Hero.tsx"), BROKEN);
    runAssessment(db, project.id);
    expect(requirementStatus("ctl-img-alt")).toBe("failed");

    const regression = db.evidence.find(
      (record) =>
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    );
    expect(regression).toBeDefined();
  });

  it("keeps dismissed findings dismissed on re-assessment", () => {
    runAssessment(db, project.id);
    db.findings[0].status = "dismissed";
    db.findings[0].dismissal = {
      reason: "accepted_risk",
      note: "Placeholder asset",
      at: new Date().toISOString(),
    };

    runAssessment(db, project.id);
    expect(db.findings).toHaveLength(1);
    expect(db.findings[0].status).toBe("dismissed");
  });
});
