import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rgaaControls } from "@complyloop/analysis-core/catalog/rgaa/controls";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import { isDomLocation } from "@complyloop/analysis-core/contract/location";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { materializeAssessmentRun } from "@/test-fixtures/materialize-assessment-run";

import { runAssessment } from "./assessment";
import { toPipelineInput } from "./assessment-pipeline";

const CLEAN_SOURCE = `export const Page = () => <img src="/x.png" alt="ok" />;\n`;

describe("runAssessment with runtime engine", () => {
  let rootPath: string;
  let db: WorkspaceSlice;
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

  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  async function assess(
    options: Omit<Parameters<typeof runAssessment>[1], "rootPath"> & {
      rootPath?: string;
    },
  ) {
    const run = await runAssessment(toPipelineInput(db, project.id), {
      rootPath,
      ...options,
    });
    materializeAssessmentRun(db, run);
    return run;
  }

  it("creates DOM findings from the injected scanner and skips AST input-label", async () => {
    const { assessment } = await assess({
      runtimeLookup: publicLookup,
      runtimeScanner: async (urls) => ({
        pages: [
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
        pageFailures: [],
      }),
    });

    expect(assessment.engines?.runtime).toBe(true);
    expect(assessment.engines?.runtimePagesScanned).toBe(1);

    const labelFindings = db.findings.filter(
      (finding) =>
        finding.checkId === "input-label" && finding.status === "open",
    );
    expect(labelFindings).toHaveLength(1);
    expect(engineFor(labelFindings[0]!)).toBe("runtime");
    expect(isDomLocation(labelFindings[0]!.location)).toBe(true);
    expect(labelFindings[0]?.fix).toBeNull();
    // A static URL is not tied to a commit: violations are reported, but the
    // runtime-only requirement cannot pass off a deploy that may be stale.
    expect(assessment.engines?.runtimeTied).toBe(false);
    expect(assessment.engines?.runtimeAuditedSha).toBeUndefined();
    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-color-contrast",
      )?.status,
    ).toBe("unable_to_verify");
  });

  describe("commit tying", () => {
    const cleanPage = async (urls: readonly string[]) => ({
      pages: [
        {
          url: urls[0]!,
          violations: [],
          incomplete: [],
          htmlValidateRan: false,
        },
      ],
      pageFailures: [],
    });

    async function commitCheckout(): Promise<string> {
      await git.init({ fs, dir: rootPath });
      await git.add({ fs, dir: rootPath, filepath: "Page.tsx" });
      return git.commit({
        fs,
        dir: rootPath,
        message: "init",
        author: { name: "t", email: "t@example.com" },
      });
    }

    const contrastStatus = () =>
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-color-contrast",
      )?.status;

    it("passes runtime-only requirements when the deployment serves the scanned commit", async () => {
      const sha = await commitCheckout();
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: cleanPage,
        runtimeTarget: { url: "https://deploy.example", sha },
      });
      expect(assessment.engines?.runtimeTied).toBe(true);
      expect(assessment.engines?.runtimeAuditedSha).toBe(sha);
      expect(contrastStatus()).toBe("passed");
    });

    it("ties a manual run to the known deployment of the checked-out commit", async () => {
      const sha = await commitCheckout();
      project.lastDeployment = { url: "https://deploy.example", sha };
      let audited: string | undefined;
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: async (urls) => {
          audited = urls[0];
          return cleanPage(urls);
        },
      });
      expect(audited).toContain("https://deploy.example");
      expect(assessment.engines?.runtimeTied).toBe(true);
      expect(assessment.engines?.runtimeAuditedSha).toBe(sha);
      expect(contrastStatus()).toBe("passed");
    });

    it("falls back to the static URL when the known deployment is for another commit", async () => {
      await commitCheckout();
      project.lastDeployment = {
        url: "https://deploy.example",
        sha: "b".repeat(40),
      };
      let audited: string | undefined;
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: async (urls) => {
          audited = urls[0];
          return cleanPage(urls);
        },
      });
      expect(audited).toContain("https://preview.example");
      expect(assessment.engines?.runtimeTied).toBe(false);
    });

    it("does not pass runtime-only requirements when one route failed", async () => {
      const sha = await commitCheckout();
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: async (urls) => ({
          pages: [
            {
              url: urls[0]!,
              violations: [],
              incomplete: [],
              loadedCleanly: true,
            },
          ],
          // A sibling configured route timed out: coverage is partial.
          pageFailures: [
            { url: "https://deploy.example/checkout", error: "timeout" },
          ],
        }),
        runtimeTarget: { url: "https://deploy.example", sha },
      });
      expect(assessment.engines?.runtimeTied).toBe(true);
      expect(contrastStatus()).toBe("unable_to_verify");
    });

    it("keeps a composition-sensitive AST finding when one route failed", async () => {
      fs.writeFileSync(
        path.join(rootPath, "Page.tsx"),
        `export const Page = () => <img src="/x.png" />;\n`,
      );
      const sha = await commitCheckout();
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: async (urls) => ({
          pages: [
            {
              url: urls[0]!,
              violations: [],
              incomplete: [],
              loadedCleanly: true,
            },
          ],
          pageFailures: [
            { url: "https://deploy.example/checkout", error: "timeout" },
          ],
        }),
        runtimeTarget: { url: "https://deploy.example", sha },
      });
      expect(assessment.engines?.runtimeTied).toBe(true);
      // The partial run cannot vouch for the unrendered page, so the AST
      // finding (normally superseded by an axe-owned check) stays open.
      expect(
        db.findings.some(
          (finding) =>
            finding.checkId === "img-alt" && finding.status === "open",
        ),
      ).toBe(true);
    });

    it("lets an untied audit close the findings it reported earlier for the same URL", async () => {
      const violating = async (urls: readonly string[]) => ({
        pages: [
          {
            url: urls[0]!,
            violations: [
              {
                id: "label",
                impact: "serious",
                description: "Form elements must have labels",
                help: "Form elements must have labels",
                nodes: [{ html: '<input id="email">', target: ["#email"] }],
              },
            ],
          },
        ],
        pageFailures: [],
      });
      await assess({ runtimeLookup: publicLookup, runtimeScanner: violating });
      const open = () =>
        db.findings.filter(
          (finding) =>
            finding.checkId === "input-label" && finding.status === "open",
        );
      expect(open()).toHaveLength(1);

      // Fixed on the site; the audit is still untied (static URL, no commit).
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: cleanPage,
      });
      expect(assessment.engines?.runtimeTied).toBe(false);
      expect(open()).toHaveLength(0);
      // Statuses stay advisory: a runtime-only requirement is not passed.
      expect(contrastStatus()).toBe("unable_to_verify");
    });

    it("stays advisory when the deployment serves a different commit", async () => {
      await commitCheckout();
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: cleanPage,
        runtimeTarget: { url: "https://deploy.example", sha: "a".repeat(40) },
      });
      expect(assessment.engines?.runtime).toBe(true);
      expect(assessment.engines?.runtimeTied).toBe(false);
      expect(assessment.engines?.runtimeAuditedSha).toBe("a".repeat(40));
      expect(contrastStatus()).toBe("unable_to_verify");
    });

    it("still reports AST findings when the runtime audit is untied", async () => {
      await commitCheckout();
      fs.writeFileSync(
        path.join(rootPath, "Page.tsx"),
        `export const Page = () => <img src="/x.png" />;\n`,
      );
      await git.add({ fs, dir: rootPath, filepath: "Page.tsx" });
      await git.commit({
        fs,
        dir: rootPath,
        message: "regress",
        author: { name: "t", email: "t@example.com" },
      });
      const { assessment } = await assess({
        runtimeLookup: publicLookup,
        runtimeScanner: cleanPage,
      });
      expect(assessment.engines?.runtimeTied).toBe(false);
      expect(
        db.findings.some(
          (finding) =>
            finding.checkId === "img-alt" && finding.status === "open",
        ),
      ).toBe(true);
    });
  });

  it("records default theme conditions on the assessment engines", async () => {
    const { assessment } = await assess({
      runtimeLookup: publicLookup,
      runtimeScanner: async (urls) => ({
        pages: [
          {
            url: urls[0]!,
            violations: [],
            incomplete: [],
            htmlValidateRan: false,
          },
        ],
        pageFailures: [],
      }),
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
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-color-contrast",
      )?.status,
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
