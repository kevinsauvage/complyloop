import type {
  Control,
  Framework,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import { controlForDisplay } from "@complyloop/adapters/control-theme";
import { presetById, projectDefaultPresetId } from "@complyloop/adapters/registry";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/client";
import { listEvidenceForExport } from "@complyloop/db/repo/evidence";
import {
  parseReportViewParam,
  type ReportView,
} from "@/core/query";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/db/types";
import {
  controlsInScope,
  findingsInScope,
  requirementsInScope,
} from "./project-scope";
import { getProjectRuntime } from "./project-runtime";
import { evidenceForProject } from "./project-visibility";
import type { ReportInput } from "./report-model";
import { getWorkspace } from "./workspace";

export type ReportLoadResult =
  | { ok: false; response: Response }
  | { ok: true; project: Project; view: ReportView; input: ReportInput };

const CONTROLS_BY_ID: ReadonlyMap<string, Control> = new Map(
  shippedCatalog().controls.map((control) => [control.id, control]),
);

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

/**
 * Catalog control themed for the project's framework. Uses a once-built Map
 * so list rendering is O(1) per finding instead of scanning the catalog.
 */
export function displayControl(controlId: string, project: Project): Control {
  const control = CONTROLS_BY_ID.get(controlId);
  if (!control) throw new PublicError("Unknown control.");
  return controlForDisplay(control, frameworkForProject(project).id);
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
  evidenceMeta?: { total: number; truncated: boolean },
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
    evidenceTotal: evidenceMeta?.total ?? runtime.evidence.length,
    evidenceTruncated: evidenceMeta?.truncated ?? false,
    exportedAt: new Date().toISOString(),
  };
}

/** Loads workspace, evidence, and report input for markdown/HTML export routes. */
export async function loadReportInput(
  request: Request,
): Promise<ReportLoadResult> {
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
      { total: exported.total, truncated: exported.truncated },
    ),
  };
}
