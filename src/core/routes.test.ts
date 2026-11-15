import { describe, expect, it } from "vitest";

import {
  PROJECT_TABS,
  projectEvidenceExportPath,
  projectEvidenceReportPath,
  projectFindingPath,
  projectPath,
} from "./routes";

describe("PROJECT_TABS", () => {
  it("lists every project tab exactly once", () => {
    expect([...PROJECT_TABS].sort()).toEqual([
      "dashboard",
      "evidence",
      "findings",
      "requirements",
      "settings",
    ]);
  });
});

describe("project route builders", () => {
  it("builds a project tab path", () => {
    expect(projectPath("p1", "dashboard")).toBe("/projects/p1/dashboard");
    expect(projectPath("p1", "findings")).toBe("/projects/p1/findings");
    expect(projectPath("p1", "settings")).toBe("/projects/p1/settings");
  });

  it("builds a finding path under its project", () => {
    expect(projectFindingPath("p1", "f42")).toBe("/projects/p1/findings/f42");
  });

  it("builds evidence report paths per format", () => {
    expect(projectEvidenceReportPath("p1", "markdown")).toBe(
      "/projects/p1/evidence/report",
    );
    expect(projectEvidenceReportPath("p1", "html")).toBe(
      "/projects/p1/evidence/report/html",
    );
  });

  it("builds the evidence export path", () => {
    expect(projectEvidenceExportPath("p1")).toBe(
      "/projects/p1/evidence/export",
    );
  });

  it("does not escape a project id that contains no slash", () => {
    // Ids come from the database, never from user input, but a builder that
    // silently rewrote them would be worse than one that passes them through.
    expect(projectPath("01H2-abc", "evidence")).toBe(
      "/projects/01H2-abc/evidence",
    );
  });
});
