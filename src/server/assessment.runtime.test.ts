import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rgaaControls } from "@complyloop/adapters/rgaa/controls";
import { isDomLocation } from "@complyloop/analysis-core/contract/location";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { runAssessment } from "./assessment";
import type { Db } from "./db";
import { materializeAssessmentRun } from "@/test-fixtures/materialize-assessment-run";

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
      orgId: "org-test",
      createdAt: new Date().toISOString(),
      runtimeBaseUrl: "https://preview.example",
      runtimeRoutes: ["/"],
    };
    db = {
      organizations: [],
      memberships: [],
      projects: [project],
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

  const publicLookup = async () => [
    { address: "93.184.216.34", family: 4 },
  ];

  async function assess(
    options: Omit<Parameters<typeof runAssessment>[2], "rootPath"> & {
      rootPath?: string;
    },
  ) {
    const run = await runAssessment(db, project.id, {
      rootPath,
      ...options,
    });
    materializeAssessmentRun(db, run);
    return run;
  }

  it("creates DOM findings from the injected scanner and skips AST input-label", async () => {
    const { assessment } = await assess({
      runtimeLookup: publicLookup,
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
    expect(engineFor(labelFindings[0]!)).toBe("runtime");
    expect(isDomLocation(labelFindings[0]!.location)).toBe(true);
    expect(labelFindings[0]?.fix).toBeNull();
    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("passed");
  });

  it("records default theme conditions on the assessment engines", async () => {
    const { assessment } = await assess({
      runtimeLookup: publicLookup,
      runtimeScanner: async (urls) => [
        {
          url: urls[0]!,
          violations: [],
          incomplete: [],
          htmlValidateRan: false,
        },
      ],
    });

    expect(assessment.engines?.themeConditions).toEqual(["dark", "light"]);
  });

  it("records runtimeError without failing the whole assessment", async () => {
    const { assessment } = await assess({
      runtimeLookup: publicLookup,
      runtimeScanner: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    });
    expect(assessment.engines?.runtime).toBe(false);
    expect(assessment.engines?.runtimeError).toMatch(/connection refused/i);
    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("records a user-safe error when the preview URL resolves privately", async () => {
    const { assessment } = await assess({
      runtimeLookup: async () => [{ address: "10.0.0.5", family: 4 }],
      runtimeScanner: async () => {
        throw new Error("scanner should not run");
      },
    });
    expect(assessment.engines?.runtime).toBe(false);
    expect(assessment.engines?.runtimeError).toMatch(
      /localhost, private, or metadata/,
    );
  });
});
