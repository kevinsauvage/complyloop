import "server-only";
import { type Finding, type EvidenceRecord } from "@complyloop/db/types";
import {
  deriveRequirementStatus,
  isStickyHumanDecision,
} from "@complyloop/analysis-core/contract/requirement-status";
import {
  authorityForCheck,
  isHtmlValidateOwnedCheck,
} from "@complyloop/analysis-core/check-authority";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type {
  Control,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { TEMPORARY_EXCEPTION_REASON } from "@complyloop/analysis-core/contract/project-types";
import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";
import { controlsInScope } from "./project-scope";
import type { ProjectRows } from "./project-rows";

/** Human exceptions and human passes block automated status overwrite. */
function requirementIsSticky(
  requirement: Requirement | undefined,
): boolean {
  if (!requirement) return false;
  return isStickyHumanDecision({
    determination: requirement.determination,
    hasException: Boolean(requirement.exception),
    hasHumanPass: Boolean(requirement.humanPass),
  });
}

export interface ClearExpiredExceptionsResult {
  requirements: Requirement[];
  evidence: EvidenceRecord[];
}

/**
 * Clears temporary exceptions whose expiresAt is in the past. Returns new
 * requirement values and evidence — does not mutate the input array.
 */
export function clearExpiredExceptions(
  requirements: ReadonlyArray<Requirement>,
  projectId: string,
  now = new Date(),
): ClearExpiredExceptionsResult {
  const evidence: EvidenceRecord[] = [];
  const updated: Requirement[] = [];
  // Build the catalog index once instead of scanning per expired exception.
  const controlById = new Map(
    shippedCatalog().controls.map((control) => [control.id, control]),
  );

  for (const original of requirements) {
    if (original.projectId !== projectId) continue;
    const exception = original.exception;
    if (
      !exception ||
      exception.reason !== TEMPORARY_EXCEPTION_REASON ||
      !exception.expiresAt
    ) {
      continue;
    }
    if (new Date(exception.expiresAt).getTime() > now.getTime()) continue;

    const control = controlById.get(original.controlId);
    const requirement: Requirement = {
      ...original,
      determination: "automated",
      updatedAt: now.toISOString(),
    };
    delete requirement.exception;
    updated.push(requirement);
    evidence.push(
      newEvidenceRecord({
        kind: "requirement_exception_cleared",
        summary: `${control?.code ?? requirement.controlId} temporary exception expired`,
        projectId,
        controlId: requirement.controlId,
        detail: { previousException: exception, expired: true },
      }),
    );
  }

  return { requirements: updated, evidence };
}

export interface RefreshRequirementStatusesOptions {
  assessmentId?: string;
  changeContext?: string;
  /** When false, runtime-only checks with no findings stay unable_to_verify. */
  runtimeRan?: boolean;
  /** Runtime checks that need ≥2 audited routes use this flag. */
  siteLevelChecksRan?: boolean;
  /** html-validate structural pass succeeded on at least one page. */
  htmlValidateRan?: boolean;
  /** Check ids confirmed not applicable on every audited page (checkId → fact). */
  applicabilityFacts?: ReadonlyMap<string, string>;
  /** Number of source files scanned during AST analysis. */
  filesScanned?: number;
  /** Test override; production uses the shipped catalog. */
  controls?: readonly Control[];
}

export interface RefreshRequirementStatusesResult {
  /** Created or updated requirements (for payload upsert). */
  requirements: Requirement[];
  evidence: EvidenceRecord[];
}

/**
 * Delegates all derivation to core (single source of truth). The adapter maps
 * the analysis-layer check id to the framework-agnostic authority class via
 * the authoritative classifier in `check-authority.ts`.
 */
function statusFromFindings(
  checkId: string | null,
  openFindings: ReadonlyArray<Pick<Finding, "kind">>,
  options: Pick<
    RefreshRequirementStatusesOptions,
    "runtimeRan" | "siteLevelChecksRan" | "htmlValidateRan" | "applicabilityFacts" | "filesScanned"
  >,
): RequirementStatus {
return deriveRequirementStatus({
      authority: checkId === null ? "manual" : authorityForCheck(checkId),
      openFindings,
      audit: {
        runtimeRan: options.runtimeRan,
        siteLevelChecksRan: options.siteLevelChecksRan,
        htmlValidateRequired:
          checkId !== null && isHtmlValidateOwnedCheck(checkId),
        htmlValidateRan: options.htmlValidateRan,
        applicabilityConfirmed:
          checkId !== null && Boolean(options.applicabilityFacts?.has(checkId)),
        filesScanned: options.filesScanned,
      },
    });
}

/** Later id wins — used when merging refresh/clearance results into scratch rows. */
export function upsertRequirementsById(
  existing: ReadonlyArray<Requirement>,
  updates: ReadonlyArray<Requirement>,
): Requirement[] {
  const byId = new Map(
    existing.map((requirement) => [requirement.id, requirement]),
  );
  for (const requirement of updates) {
    byId.set(requirement.id, requirement);
  }
  return [...byId.values()];
}

function refreshRequirementForControl(
  workingByControlId: Map<string, Requirement>,
  openFindingsByControlId: ReadonlyMap<string, Finding[]>,
  projectId: string,
  control: Control,
  options: RefreshRequirementStatusesOptions & { now: string },
  touchedById: Map<string, Requirement>,
  evidence: EvidenceRecord[],
): void {
  const {
    assessmentId,
    changeContext,
    runtimeRan,
    siteLevelChecksRan,
    htmlValidateRan,
    applicabilityFacts,
    filesScanned,
    now,
  } = options;

  const track = (requirement: Requirement) => {
    workingByControlId.set(requirement.controlId, requirement);
    touchedById.set(requirement.id, requirement);
  };

  if (control.checkId === null) {
    // Manual / custom controls without a check stay unable_to_verify unless
    // a human pass or exception already sets a different status.
    const existing = workingByControlId.get(control.id);
    if (requirementIsSticky(existing)) {
      return;
    }
    if (!existing) {
      track({
        id: crypto.randomUUID(),
        projectId,
        controlId: control.id,
        status: "unable_to_verify",
        determination: "automated",
        updatedAt: now,
      });
    } else if (existing.status !== "unable_to_verify") {
      track({
        ...existing,
        status: "unable_to_verify",
        determination: "automated",
        updatedAt: now,
      });
    }
    return;
  }

  const existing = workingByControlId.get(control.id);
  // Human exceptions / human passes are sticky until explicitly cleared
  // (temporary exceptions may expire earlier — see clearExpiredExceptions).
  if (requirementIsSticky(existing)) {
    return;
  }

  const openFindings = openFindingsByControlId.get(control.id) ?? [];
  const status = statusFromFindings(control.checkId, openFindings, {
    runtimeRan,
    siteLevelChecksRan,
    htmlValidateRan,
    applicabilityFacts,
    filesScanned,
  });

  if (!existing) {
    track({
      id: crypto.randomUUID(),
      projectId,
      controlId: control.id,
      status,
      determination: "automated",
      updatedAt: now,
    });
    return;
  }

  if (existing.status !== status) {
    const regression = existing.status === "passed" && status === "failed";
    const attribution =
      regression && changeContext ? ` — ${changeContext}` : "";
    evidence.push(
      newEvidenceRecord({
        kind: "requirement_status_changed",
        summary: `${control.code} (${control.title}): ${existing.status} → ${status}${regression ? " — compliance regression" : ""}${attribution}`,
        projectId,
        controlId: control.id,
        assessmentId,
        detail: {
          from: existing.status,
          to: status,
          regression,
          changeContext: regression ? changeContext : undefined,
          ...(status === "not_applicable" && control.checkId
            ? {
                applicabilityFact:
                  applicabilityFacts?.get(control.checkId) ??
                  "Criterion does not apply on audited pages.",
              }
            : {}),
        },
      }),
    );
    track({
      ...existing,
      status,
      determination: "automated",
      updatedAt: now,
    });
  }
}

function scopedControlsForRefresh(
  project: Project | undefined,
  controlIds: readonly string[] | undefined,
  catalog: readonly Control[] | undefined,
): Control[] {
  const base = project
    ? controlsInScope(project, catalog)
    : [...(catalog ?? shippedCatalog().controls)];
  if (!controlIds) return [...base];
  const controlIdSet = new Set(controlIds);
  return base.filter((control) => controlIdSet.has(control.id));
}

/**
 * Re-derives requirement statuses from findings. Returns new requirement
 * values and evidence only — does not mutate inputs.
 */
export function refreshRequirementStatuses(input: {
  project: Project;
  findings: ReadonlyArray<Finding>;
  requirements: ReadonlyArray<Requirement>;
  controlIds?: readonly string[];
  options?: RefreshRequirementStatusesOptions;
}): RefreshRequirementStatusesResult {
  const { project, findings, controlIds } = input;
  const options = input.options ?? {};
  const now = new Date().toISOString();
  const workingByControlId = new Map(
    input.requirements
      .filter((requirement) => requirement.projectId === project.id)
      .map((requirement) => [
        requirement.controlId,
        structuredClone(requirement),
      ]),
  );
  const touchedById = new Map<string, Requirement>();
  const evidence: EvidenceRecord[] = [];
  const scoped = scopedControlsForRefresh(
    project,
    controlIds,
    options.controls,
  );

  // Index open findings by control once instead of scanning the full array for
  // every scoped control (O(controls × findings) → O(findings + controls)).
  const openFindingsByControlId = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (finding.projectId !== project.id || finding.status !== "open") continue;
    const list = openFindingsByControlId.get(finding.controlId);
    if (list) list.push(finding);
    else openFindingsByControlId.set(finding.controlId, [finding]);
  }

  for (const control of scoped) {
    refreshRequirementForControl(
      workingByControlId,
      openFindingsByControlId,
      project.id,
      control,
      { ...options, now },
      touchedById,
      evidence,
    );
  }

  return { requirements: [...touchedById.values()], evidence };
}

/**
 * Apply status refresh into working ProjectRows. Omit `controlIds` for a
 * full-scope refresh (assessment); pass a list to refresh only those controls
 * (entity writes after dismiss / clear exception / verify).
 */
export function applyRequirementStatusRefresh(
  rows: ProjectRows,
  project: Project,
  options: RefreshRequirementStatusesOptions & {
    controlIds?: readonly string[];
  } = {},
): void {
  const { controlIds, ...refreshOptions } = options;
  if (controlIds !== undefined && controlIds.length === 0) return;
  const result = refreshRequirementStatuses({
    project,
    findings: rows.findings,
    requirements: rows.requirements,
    controlIds,
    options: refreshOptions,
  });
  rows.requirements = upsertRequirementsById(
    rows.requirements,
    result.requirements,
  );
  rows.evidence.push(...result.evidence);
}
