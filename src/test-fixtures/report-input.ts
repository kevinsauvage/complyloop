import {
  rgaaControls,
  rgaaFramework,
} from "@complyloop/analysis-core/adapters/rgaa/controls";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

import type { ReportInput } from "@/server/reporting/report-model";

import { testProject } from "./project";

export const reportSampleProject = testProject({
  name: "demo-app",
  sourceRef: "https://github.com/acme/demo-app",
});

export function sampleReportInput(): ReportInput {
  const requirements: Requirement[] = rgaaControls.map((control, index) => ({
    id: `r${index}`,
    projectId: reportSampleProject.id,
    controlId: control.id,
    status: control.id === "ctl-img-alt" ? "failed" : "passed",
    determination: "automated",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }));
  requirements[0] = {
    ...requirements[0],
    status: "not_applicable",
    determination: "human_review",
    exception: {
      reason: "not_applicable",
      note: "Marketing microsite excluded from scope",
      at: "2026-01-02T12:00:00.000Z",
    },
  };

  const findings: Finding[] = [
    {
      id: "f1",
      projectId: reportSampleProject.id,
      controlId: "ctl-button-name",
      assessmentId: "a1",
      checkId: "button-name",
      status: "open",
      kind: "violation",
      severity: "critical",
      confidence: "high",
      reason: "Button has no accessible name",
      location: {
        kind: "source",
        filePath: "Button.tsx",
        line: 4,
        column: 1,
        snippet: "<button><svg /></button>",
        span: { start: 0, end: 24 },
      },
      fix: null,
      explanations: [],
      detectedAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  const remediations: Remediation[] = [
    {
      id: "rem1",
      findingId: "f1",
      status: "detected",
      suggestion: null,
      history: [],
    },
  ];

  return {
    project: reportSampleProject,
    framework: rgaaFramework,
    controls: rgaaControls,
    requirements,
    findings,
    remediations,
    evidence: [
      {
        id: "e1",
        at: "2026-01-02T00:00:00.000Z",
        kind: "assessment_completed",
        summary: 'Assessment of "demo-app": 1 files scanned',
        projectId: reportSampleProject.id,
      },
    ],
    evidenceTotal: 1,
    evidenceTruncated: false,
    exportedAt: "2026-01-03T00:00:00.000Z",
  };
}
