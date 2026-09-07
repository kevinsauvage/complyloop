import type { Framework, Project } from "@complyloop/analysis-core/contract/project-types";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import { presetById, projectDefaultPresetId } from "@complyloop/adapters/registry";
import type { ReportView } from "@/core/query";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/db/types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
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
export function frameworkForProject(project: Project): Framework {
  const frameworks = shippedCatalog().frameworks;
  const preset = presetById(projectDefaultPresetId(project));
  if (preset) {
    const fromPreset = frameworks.find(
      (framework) => framework.id === preset.frameworkId,
    );
    if (fromPreset) return fromPreset;
  }
  const fallback = frameworks[0];
  if (!fallback) {
    throw new Error("No compliance framework is configured.");
  }
  return fallback;
}

export type ReportRuntimeSlice = {
  findings: ReadonlyArray<Finding>;
  remediations: ReadonlyArray<Remediation>;
  requirements: ReadonlyArray<Requirement>;
  evidence: ReadonlyArray<EvidenceRecord>;
  assessments?: ReadonlyArray<Assessment>;
  alerts?: ReadonlyArray<Alert>;
};

/** Builds report input for a project's current store snapshot. */
export function reportInputForProject(
  runtime: ReportRuntimeSlice,
  project: Project,
): ReportInput {
  const findings = findingsInScope(runtime.findings, project);
  const findingIds = new Set(findings.map((finding) => finding.id));
  const framework = frameworkForProject(project);
  return {
    project,
    framework,
    controls: controlsInScope(project),
    findings,
    remediations: runtime.remediations.filter((remediation) =>
      findingIds.has(remediation.findingId),
    ),
    requirements: requirementsInScope(runtime.requirements, project),
    evidence: evidenceForProject(runtime.evidence, project.id),
    exportedAt: new Date().toISOString(),
  };
}

/** Loads workspace, evidence, and report input for markdown/HTML export routes. */
export async function loadReportInput(
  request: Request,
): Promise<ReportLoadResult> {
  const { parseReportViewParam } = await import("@/core/query");
  const { getDrizzle } = await import("@complyloop/db/client");
  const { listEvidenceForExport } = await import(
    "@complyloop/db/repo/evidence"
  );
  const { getWorkspace } = await import("./workspace");
  const { getProjectRuntime } = await import("./project-runtime");

  const { project } = await getWorkspace();
  if (!project) {
    return {
      ok: false,
      response: new Response("No project connected.", { status: 404 }),
    };
  }

  const view = parseReportViewParam(
    new URL(request.url).searchParams.get("view"),
  );
  const [runtime, exported] = await Promise.all([
    getProjectRuntime(project.id),
    listEvidenceForExport(await getDrizzle(), project.id),
  ]);

  return {
    ok: true,
    project,
    view,
    input: reportInputForProject(
      { ...runtime, evidence: exported.records },
      project,
    ),
  };
}
