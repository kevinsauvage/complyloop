import type { Framework, Project } from "@complyloop/analysis-core/contract/project-types";
import { presetById, presetCatalog } from "@complyloop/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import type { Db } from "./db";
import {
  controlsInScope,
  findingsInScope,
  requirementsInScope,
} from "./assessment-status";
import { evidenceForProject } from "./project-visibility";
import type { ReportInput } from "./report-model";

export type { ReportInput };
export {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
} from "./report-markdown";

/** Resolves the framework named by the project's assessment preset. */
export function frameworkForProject(db: Db, project: Project): Framework {
  const preset = presetById(projectDefaultPresetId(project, presetCatalog));
  if (preset) {
    const fromPreset = db.frameworks.find(
      (framework) => framework.id === preset.frameworkId,
    );
    if (fromPreset) return fromPreset;
  }
  const fallback = db.frameworks[0];
  if (!fallback) {
    throw new Error("No compliance framework is configured.");
  }
  return fallback;
}

/** Builds report input for a project's current store snapshot. */
export function reportInputForProject(db: Db, project: Project): ReportInput {
  const findings = findingsInScope(db.findings, project);
  const findingIds = new Set(findings.map((finding) => finding.id));
  const framework = frameworkForProject(db, project);
  return {
    project,
    framework,
    controls: controlsInScope(db, project),
    findings,
    remediations: db.remediations.filter((remediation) =>
      findingIds.has(remediation.findingId),
    ),
    requirements: requirementsInScope(db.requirements, project),
    evidence: evidenceForProject(db.evidence, project.id),
    exportedAt: new Date().toISOString(),
  };
}
