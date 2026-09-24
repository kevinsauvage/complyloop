import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import { controlForDisplay } from "@complyloop/analysis-core/catalog/control-theme";
import {
  presetById,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/catalog/registry";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Framework,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { listEvidenceForExport } from "@complyloop/db/repo/evidence";

import { parseReportViewParam, type ReportView } from "@/core/filter-params";

import { getProjectRuntime } from "../workspace/project-runtime";
import {
  controlsInScope,
  findingsInScope,
  requirementsInScope,
} from "../workspace/project-scope";
import { getWorkspace } from "../workspace/workspace";
import type { ReportInput } from "./report-model";

export type ReportLoadResult =
  | { ok: false; response: Response }
  | { ok: true; project: Project; view: ReportView; input: ReportInput };

const CONTROLS_BY_ID: ReadonlyMap<string, Control> = new Map(
  shippedCatalog().controls.map((control) => [control.id, control]),
);

/**
 * Framework resolved per preset id. The catalog is static (<200 controls),
 * so this is a direct lookup — no memo Map (the cached version saved nothing
 * measurable and hid a second source of framework truth).
 */
export function frameworkForProject(project: Project): Framework {
  const presetId = projectDefaultPresetId(project);
  const frameworks = shippedCatalog().frameworks;
  const preset = presetById(presetId);
  const resolved =
    (preset
      ? frameworks.find((framework) => framework.id === preset.frameworkId)
      : undefined) ?? frameworks[0];
  if (!resolved) {
    throw new Error("No compliance framework is configured.");
  }
  return resolved;
}

/** Catalog control themed for the project's framework (no memo Map — see `frameworkForProject`). */
export function displayControl(controlId: string, project: Project): Control {
  const frameworkId = frameworkForProject(project).id;
  const control = CONTROLS_BY_ID.get(controlId);
  if (!control) throw new PublicError("Unknown control.");
  return controlForDisplay(control, frameworkId);
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
    evidence: [...runtime.evidence],
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
