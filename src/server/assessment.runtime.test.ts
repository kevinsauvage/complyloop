import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { isDomLocation } from "@/core/location";
import type { Project } from "@/core/types";
import { runAssessment } from "./assessment";
import type { Db } from "./db";

const CLEAN_SOURCE = `export const Page = () => <img src="/x.png" alt="ok" />;\n`;

describe("runAssessment with runtime engine", () => {
  let rootPath: string;
  let db: Db;
  let project: Project;

  beforeEach(() => {
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-runtime-"));
    fs.writeFileSync(path.join(rootPath, "Page.tsx"), CLEAN_SOURCE);
    project = {
      id: "proj-runtime",
      name: "Runtime",
      source: "github",
      createdAt: new Date().toISOString(),
      runtimeBaseUrl: "https://preview.example",
      runtimeRoutes: ["/"],
    };
    db = {
      frameworks: [rgaaFramework],
      controls: rgaaControls,
      organizations: [],
      memberships: [],
      projects: [project],
      activeProjectId: project.id,
      requirements: rgaaControls.map((control) => ({
        id: `req-${control.id}`,
        projectId: project.id,
        controlId: control.id,
        status: "unable_to_verify" as const,
        determination: "automated" as const,
        updatedAt: new Date().toISOString(),
      })),
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

  it("creates DOM findings from the injected scanner and skips AST input-label", async () => {
    const assessment = await runAssessment(db, project.id, {
      rootPath,
      runtimeScanner: async (urls) => [
        {
          url: urls[0]!,
          violations: [
            {
              id: "label",
              impact: "serious",
              description: "Form elements must have labels",
              help: "Form elements must have labels",
              nodes: [
                {
                  html: '<input id="email">',
                  target: ["#email"],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(assessment.engines?.runtime).toBe(true);
    expect(assessment.engines?.runtimePagesScanned).toBe(1);

    const labelFindings = db.findings.filter(
      (finding) => finding.checkId === "input-label" && finding.status === "open",
    );
    expect(labelFindings).toHaveLength(1);
    expect(labelFindings[0]?.engine).toBe("runtime");
    expect(isDomLocation(labelFindings[0]!.location)).toBe(true);
    expect(labelFindings[0]?.fix).toBeNull();
  });

  it("records runtimeError without failing the whole assessment", async () => {
    const assessment = await runAssessment(db, project.id, {
      rootPath,
      runtimeScanner: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    });
    expect(assessment.engines?.runtime).toBe(false);
    expect(assessment.engines?.runtimeError).toMatch(/CONNECTION_REFUSED/);
  });
});
