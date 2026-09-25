import { describe, expect, it } from "vitest";

import { sampleReportInput } from "@/test-fixtures/report-input";

import {
  buildAuditReportHtml,
  buildEngineeringReportHtml,
} from "./report-html/report";
import { buildAuditReportMarkdown } from "./report-markdown";
import { composeAuditReport, composeEngineeringReport } from "./report-model";

describe("report model composers", () => {
  it("labels evidence kinds once so markdown and HTML stay in sync", () => {
    const input = sampleReportInput();
    input.evidence.push({
      id: "e-kind",
      at: "2026-01-03T00:00:00.000Z",
      kind: "finding",
      summary: "New finding recorded",
      projectId: input.project.id,
      detail: { event: "detected" },
    });

    const model = composeAuditReport(input);
    expect(model.evidence.map((row) => row.kindLabel)).toEqual([
      "Finding detected",
      "Assessment completed",
    ]);

    const markdown = buildAuditReportMarkdown(input);
    const html = buildAuditReportHtml(input);
    expect(markdown).toContain("Finding detected");
    expect(markdown).not.toContain("finding_detected");
    expect(html).toContain("Finding detected");
    expect(html).not.toContain("finding_detected");
  });

  it("feeds engineering findings to both renderers from one model", () => {
    const model = composeEngineeringReport(sampleReportInput());
    expect(model.findings).toHaveLength(1);
    expect(model.findings[0]?.locationRef).toBe("Button.tsx:4");

    const html = buildEngineeringReportHtml(sampleReportInput());
    expect(html).toContain(model.findings[0]!.reason);
    expect(html).toContain(model.findings[0]!.locationRef);
  });

  it("falls back when a finding has no catalog control or remediation", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      controlId: "ctl-unknown",
    };
    input.controls = [];
    input.requirements = [];
    input.remediations = [
      {
        id: "rem-ai",
        findingId: "f1",
        status: "suggested",
        suggestion: {
          provenance: "ai",
          description: "Add an accessible name",
          proposedSnippet: "<button>Save</button>",
          confidence: "medium",
        },
        history: [],
      },
    ];
    const model = composeEngineeringReport(input);
    expect(model.findings[0]?.code).toBe("ctl-unknown");
    expect(model.findings[0]?.requirementLine).toBeUndefined();
    expect(model.findings[0]?.engine).toBe("ast");
    expect(model.findings[0]?.suggestion?.provenance).toBe("ai");
  });

  it("hints fenced-code languages from the finding location", () => {
    const input = sampleReportInput();
    const base = input.findings[0]!;
    const locations = [
      [
        {
          kind: "source",
          filePath: "a.jsx",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "jsx",
      ],
      [
        {
          kind: "source",
          filePath: "a.ts",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "ts",
      ],
      [
        {
          kind: "source",
          filePath: "a.js",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "js",
      ],
      [
        {
          kind: "source",
          filePath: "a.html",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "html",
      ],
      [
        {
          kind: "source",
          filePath: "a.vue",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "vue",
      ],
      [
        {
          kind: "source",
          filePath: "a.svelte",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "svelte",
      ],
      [
        {
          kind: "source",
          filePath: "a.css",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "css",
      ],
      [
        {
          kind: "source",
          filePath: "a.md",
          line: 1,
          column: 1,
          snippet: "x",
          span: { start: 0, end: 1 },
        },
        "",
      ],
      [
        {
          kind: "dom",
          url: "https://app.example/",
          selector: "button",
          snippet: "<button>",
        },
        "html",
      ],
    ] as const;
    input.findings = locations.map(([location], index) => ({
      ...base,
      id: `f-lang-${index}`,
      location: location as typeof base.location,
    }));
    const model = composeEngineeringReport(input);
    expect(model.findings.map((card) => card.language)).toEqual(
      locations.map(([, language]) => language),
    );
  });

  it("excludes project-less evidence and includes github metadata on the header", () => {
    const input = sampleReportInput();
    input.project = {
      ...input.project,
      github: {
        fullName: "acme/demo-app",
        defaultBranch: "main",
        private: false,
      },
    };
    input.evidence.push({
      id: "e-global",
      at: "2026-01-04T00:00:00.000Z",
      kind: "project_connected",
      summary: "Connected",
    });
    const model = composeAuditReport(input);
    expect(model.header.githubFullName).toBe("acme/demo-app");
    expect(model.evidence.some((row) => row.summary === "Connected")).toBe(
      false,
    );
  });

  it("notes capped evidence in both renderers, and stays silent when whole", () => {
    const input = sampleReportInput();
    input.evidenceTotal = 2000;
    input.evidenceTruncated = true;

    const model = composeAuditReport(input);
    expect(model.evidenceTotal).toBe(2000);
    expect(model.evidenceTruncated).toBe(true);

    const markdown = buildAuditReportMarkdown(input);
    expect(markdown).toContain("latest 1 of 2000 evidence records");
    const html = buildAuditReportHtml(input);
    expect(html).toContain("latest 1 of 2000 evidence records");

    const whole = sampleReportInput();
    expect(buildAuditReportMarkdown(whole)).not.toContain("latest");
    expect(buildAuditReportHtml(whole)).not.toContain("latest");
  });

  it("labels a non-RGAA/WCAG secondary reference as Also", () => {
    const input = sampleReportInput();
    input.controls = [
      {
        ...input.controls[0],
        secondaryCode: "ISO 40500",
      },
    ];
    input.requirements = input.requirements.filter(
      (requirement) => requirement.controlId === input.controls[0]!.id,
    );
    const model = composeAuditReport(input);
    expect(model.requirements[0]?.secondaryLabel).toBe("Also");
  });

  it("renders the export window (oldest-first) newest-first", () => {
    const input = sampleReportInput();
    input.evidence = [1, 2, 3].map((day) => ({
      id: `e${day}`,
      at: `2026-01-0${day}T00:00:00.000Z`,
      kind: "assessment_completed",
      summary: `assessment day ${day}`,
      projectId: input.project.id,
    }));
    input.evidenceTotal = 3;

    const model = composeAuditReport(input);
    expect(model.evidence.map((row) => row.summary)).toEqual([
      "assessment day 3",
      "assessment day 2",
      "assessment day 1",
    ]);
  });
});
