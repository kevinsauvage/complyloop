import type {
  Control,
  Framework,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import { controlForDisplay } from "@complyloop/analysis-core/adapters/control-theme";
import { presetById, projectDefaultPresetId } from "@complyloop/analysis-core/adapters/registry";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { listEvidenceForExport } from "@complyloop/db/repo/evidence";
import {
  parseReportViewParam,
  type ReportView,
} from "@/core/filters";
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

/**
 * Framework resolved per preset id (catalog is static), so `displayControl` on
 * a list render does not re-scan the framework list for every finding row.
 */
const FRAMEWORK_BY_PRESET: Map<string, Framework> = new Map();

/** Resolves the framework named by the project's assessment preset. */
export function frameworkForProject(project: Project): Framework {
  const presetId = projectDefaultPresetId(project);
  const cached = FRAMEWORK_BY_PRESET.get(presetId);
  if (cached) return cached;

  const frameworks = shippedCatalog().frameworks;
  const preset = presetById(presetId);
  const resolved =
    (preset
      ? frameworks.find((framework) => framework.id === preset.frameworkId)
      : undefined) ?? frameworks[0];
  if (!resolved) {
    throw new Error("No compliance framework is configured.");
  }
  FRAMEWORK_BY_PRESET.set(presetId, resolved);
  return resolved;
}

/** Themed controls cached per `frameworkId:controlId` (bounded, catalog-static). */
const DISPLAY_CONTROLS: Map<string, Control> = new Map();

/**
 * Catalog control themed for the project's framework. Uses once-built Maps so
 * list rendering is O(1) per finding instead of scanning/re-theming the catalog.
 */
export function displayControl(controlId: string, project: Project): Control {
  const frameworkId = frameworkForProject(project).id;
  const key = `${frameworkId}\u0000${controlId}`;
  const cached = DISPLAY_CONTROLS.get(key);
  if (cached) return cached;

  const control = CONTROLS_BY_ID.get(controlId);
  if (!control) throw new PublicError("Unknown control.");
  const themed = controlForDisplay(control, frameworkId);
  DISPLAY_CONTROLS.set(key, themed);
  return themed;
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
    // Evidence comes from the export window below; skip the runtime's own
    // window read so evidence is fetched exactly once per export.
    getProjectRuntime(project.id, { includeEvidence: false }),
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
