/**
 * Assessment status application layer.
 *
 * Orchestrates rows and evidence around the single derivation entry point
 * `deriveStatusForCheck` (`@complyloop/analysis-core/check-authority`). All
 * status law — authority classes, sticky human gates, engine gates — lives in
 * analysis-core; this module never re-maps check ids or redefines derivation.
 */
import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import { deriveStatusForCheck } from "@complyloop/analysis-core/check-authority";
import {
  type EvidenceRecord,
  type Finding,
  type Requirement,
} from "@complyloop/analysis-core/contract/entities";
import { TEMPORARY_EXCEPTION_REASON } from "@complyloop/analysis-core/contract/entities";
import {
  type Control,
  type Project,
} from "@complyloop/analysis-core/contract/project-types";
import {
  hasViolationsSinceDecision,
  isStickyHumanDecision,
} from "@complyloop/analysis-core/contract/requirement-status";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";

import { stickyDecisionAt } from "@/core/requirements/masked-findings";
import { clearRequirementHumanDetermination } from "@/core/requirements/requirement-human-determination";

import type { ProjectRows } from "../workspace/project-rows";
import { controlsInScope } from "../workspace/project-scope";

/** Human exceptions and human passes block automated status overwrite. */
function requirementIsSticky(requirement: Requirement | undefined): boolean {
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

type TrackRequirement = (requirement: Requirement) => void;

/**
 * Manual / custom controls (no checkId) stay `unable_to_verify` unless a sticky
 * human decision already applies.
 */
function refreshManualControl(
  existing: Requirement | undefined,
  projectId: string,
  controlId: string,
  now: string,
  track: TrackRequirement,
): void {
  if (requirementIsSticky(existing)) {
    return;
  }
  if (!existing) {
    track({
      id: crypto.randomUUID(),
      projectId,
      controlId,
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: now,
    });
    return;
  }
  if (existing.status !== "unable_to_verify") {
    track({
      ...existing,
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: now,
    });
  }
}

/** Apply a newly derived status; record evidence when the status actually changes. */
function applyDerivedStatusChange(input: {
  existing: Requirement;
  status: RequirementStatus;
  control: Control;
  projectId: string;
  assessmentId: string | undefined;
  changeContext: string | undefined;
  applicabilityFacts: ReadonlyMap<string, string> | undefined;
  now: string;
  track: TrackRequirement;
  evidence: EvidenceRecord[];
}): void {
  const {
    existing,
    status,
    control,
    projectId,
    assessmentId,
    changeContext,
    applicabilityFacts,
    now,
    track,
    evidence,
  } = input;
  if (existing.status === status) return;

  const regression = existing.status === "passed" && status === "failed";
  const attribution = regression && changeContext ? ` — ${changeContext}` : "";
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

/**
 * Revoke a sticky human decision because violations were detected after it:
 * the decision judged the findings a human saw, not later regressions. The
 * cleared decision is kept in evidence so the history stays auditable.
 */
function rearmStickyDecision(input: {
  existing: Requirement;
  decisionAt: string | undefined;
  openFindings: readonly Finding[];
  control: Control;
  projectId: string;
  assessmentId: string | undefined;
  now: string;
  track: TrackRequirement;
  evidence: EvidenceRecord[];
}): Requirement {
  const {
    existing,
    decisionAt,
    openFindings,
    control,
    projectId,
    assessmentId,
    now,
    track,
    evidence,
  } = input;
  const decidedAt = Date.parse(decisionAt ?? "");
  const newViolationIds = openFindings
    .filter(
      (finding) =>
        finding.kind === "violation" &&
        Date.parse(finding.detectedAt) > decidedAt,
    )
    .map((finding) => finding.id);
  const field = existing.exception ? "exception" : "humanPass";
  const cleared: Requirement = {
    ...clearRequirementHumanDetermination(existing, field),
    updatedAt: now,
  };
  evidence.push(
    newEvidenceRecord({
      kind:
        field === "exception"
          ? "requirement_exception_cleared"
          : "requirement_human_pass_cleared",
      summary: `${control.code} ${field === "exception" ? "exception" : "human pass"} re-opened — ${newViolationIds.length} new violation${newViolationIds.length === 1 ? "" : "s"} detected after the decision`,
      projectId,
      controlId: control.id,
      assessmentId,
      detail: {
        reopened: true,
        ...(field === "exception"
          ? { previousException: existing.exception }
          : { previousHumanPass: existing.humanPass }),
        decisionAt,
        newViolationFindingIds: newViolationIds,
      },
    }),
  );
  track(cleared);
  return cleared;
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

  const track: TrackRequirement = (requirement) => {
    workingByControlId.set(requirement.controlId, requirement);
    touchedById.set(requirement.id, requirement);
  };

  if (control.checkId === null) {
    refreshManualControl(
      workingByControlId.get(control.id),
      projectId,
      control.id,
      now,
      track,
    );
    return;
  }

  let existing = workingByControlId.get(control.id);
  const openFindings = openFindingsByControlId.get(control.id) ?? [];
  // Human exceptions / human passes are sticky until explicitly cleared
  // (temporary exceptions may expire earlier — see clearExpiredExceptions)
  // or re-armed by a violation the decision never judged.
  if (existing && requirementIsSticky(existing)) {
    const decisionAt = stickyDecisionAt(existing);
    if (!hasViolationsSinceDecision(openFindings, decisionAt)) return;
    existing = rearmStickyDecision({
      existing,
      decisionAt,
      openFindings,
      control,
      projectId,
      assessmentId,
      now,
      track,
      evidence,
    });
  }

  const status = deriveStatusForCheck(control.checkId, openFindings, {
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

  applyDerivedStatusChange({
    existing,
    status,
    control,
    projectId,
    assessmentId,
    changeContext,
    applicabilityFacts,
    now,
    track,
    evidence,
  });
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
