import type { Framework, Project } from "@complyloop/analysis-core/contract/project-types";
import { presetById, presetCatalog } from "@complyloop/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import type { ReportView } from "@/core/report-view";
import type { Db } from "./db";
import {
  controlsInScope,
  findingsInScope,
  requirementsInScope,
} from "./assessment-status";
import { evidenceForProject } from "./project-visibility";
import type { ReportInput } from "./report-model";

export type { ReportInput } from "./report-model";

export type ReportLoadResult =
  | { ok: false; response: Response }
  | { ok: true; project: Project; view: ReportView; input: ReportInput };

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

/** Loads workspace, evidence, and report input for markdown/HTML export routes. */
export async function loadReportInput(
  request: Request,
): Promise<ReportLoadResult> {
  const { parseReportViewParam } = await import("@/core/report-view");
  const { getDrizzle } = await import("@complyloop/db/client");
  const { listEvidenceForExport } = await import(
    "@complyloop/db/postgres-queries"
  );
  const { getWorkspace } = await import("./workspace");

  const { db, project } = await getWorkspace();
  if (!project) {
    return {
      ok: false,
      response: new Response("No project connected.", { status: 404 }),
    };
  }

  const view = parseReportViewParam(
    new URL(request.url).searchParams.get("view"),
  );
  const exported = await listEvidenceForExport(await getDrizzle(), project.id);

  return {
    ok: true,
    project,
    view,
    input: reportInputForProject({ ...db, evidence: exported.records }, project),
  };
}
