import { shippedCatalog } from "@complyloop/adapters/catalog";
import { presetById } from "@complyloop/adapters/registry";
import { type Finding, type EvidenceRecord } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
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
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";
import { findingsForProject, requirementsForProject } from "./project-visibility";
import type { ProjectRows } from "./project-rows";

/**
 * Control IDs this project assesses. Uses live preset membership so new rules
 * apply without rewriting stored project fields. `undefined` means the whole
 * catalog.
 */
export function scopedControlIds(
  project: Project,
): ReadonlySet<string> | undefined {
  const presetId = project.defaultPresetId;
  if (!presetId) return undefined;
  const preset = presetById(presetId);
  if (!preset) return undefined;
  return new Set(preset.controlIds);
}

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

/**
 * Controls assessed for a project. `undefined` scope means the full catalog.
 * Pass `catalog` in tests that inject a subset; production uses the shipped set.
 */
function catalogControls(catalog?: readonly Control[]): Control[] {
  return catalog === undefined ? shippedCatalog().controls : [...catalog];
}

export function controlsInScope(
  project: Project,
  catalog?: readonly Control[],
): Control[] {
  const controls = catalogControls(catalog);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return [...controls];
  return controls.filter((control) => controlIds.has(control.id));
}

/** Fails loud when the catalog or preset scope would produce a no-op assessment. */
export function assertAssessableCatalog(
  project: Project,
  catalog?: readonly Control[],
): Control[] {
  const scoped = controlsInScope(project, catalog);
  if (scoped.length > 0) return scoped;
  throw new PublicError(
    catalogControls(catalog).length === 0
      ? "Compliance catalog is unavailable."
      : "No controls are in scope for this project. Check the assessment preset in Settings.",
  );
}

/** Requirements for a project that fall inside its assessment target. */
export function requirementsInScope(
  requirements: ReadonlyArray<Requirement>,
  project: Project,
): Requirement[] {
  const forProject = requirementsForProject(requirements, project.id);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return forProject;
  return forProject.filter((requirement) =>
    controlIds.has(requirement.controlId),
  );
}

/** Findings for a project that fall inside its assessment target. */
export function findingsInScope(
  findings: ReadonlyArray<Finding>,
  project: Project,
): Finding[] {
  const forProject = findingsForProject(findings, project.id);
  const controlIds = scopedControlIds(project);
  if (!controlIds) return forProject;
  return forProject.filter((finding) => controlIds.has(finding.controlId));
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

    const control = catalogControls().find(
      (candidate) => candidate.id === original.controlId,
    );
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

/** Apply clearExpiredExceptions into a working ProjectRows. */
export function applyExpiredExceptionClearance(
  rows: ProjectRows,
  projectId: string,
  now = new Date(),
): void {
  const cleared = clearExpiredExceptions(rows.requirements, projectId, now);
  for (const requirement of cleared.requirements) {
    const index = rows.requirements.findIndex(
      (candidate) => candidate.id === requirement.id,
    );
    if (index >= 0) {
      rows.requirements[index] = requirement;
    }
  }
  rows.evidence.push(...cleared.evidence);
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
    "runtimeRan" | "siteLevelChecksRan" | "htmlValidateRan" | "applicabilityFacts"
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
    },
  });
}

function requirementForControl(
  requirements: ReadonlyArray<Requirement>,
  projectId: string,
  controlId: string,
): Requirement | undefined {
  return requirements.find(
    (candidate) =>
      candidate.projectId === projectId && candidate.controlId === controlId,
  );
}

function refreshRequirementForControl(
  working: Requirement[],
  findings: ReadonlyArray<Finding>,
  projectId: string,
  control: Control,
  options: RefreshRequirementStatusesOptions & { now: string },
  touched: Requirement[],
  evidence: EvidenceRecord[],
): void {
  const {
    assessmentId,
    changeContext,
    runtimeRan,
    siteLevelChecksRan,
    htmlValidateRan,
    applicabilityFacts,
    now,
  } = options;

  const track = (requirement: Requirement) => {
    const index = working.findIndex((candidate) => candidate.id === requirement.id);
    if (index >= 0) {
      working[index] = requirement;
    } else {
      working.push(requirement);
    }
    const touchedIndex = touched.findIndex(
      (candidate) => candidate.id === requirement.id,
    );
    if (touchedIndex >= 0) {
      touched[touchedIndex] = requirement;
    } else {
      touched.push(requirement);
    }
  };

  if (control.checkId === null) {
    // Manual / custom controls without a check stay unable_to_verify unless
    // a human pass or exception already sets a different status.
    const existing = requirementForControl(working, projectId, control.id);
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

  const existing = requirementForControl(working, projectId, control.id);
  // Human exceptions / human passes are sticky until explicitly cleared
  // (temporary exceptions may expire earlier — see clearExpiredExceptions).
  if (requirementIsSticky(existing)) {
    return;
  }

  const openFindings = findings.filter(
    (finding) =>
      finding.projectId === projectId &&
      finding.controlId === control.id &&
      finding.status === "open",
  );
  const status = statusFromFindings(control.checkId, openFindings, {
    runtimeRan,
    siteLevelChecksRan,
    htmlValidateRan,
    applicabilityFacts,
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
    : catalogControls(catalog);
  if (!controlIds) return base;
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
  const working = structuredClone(
    input.requirements.filter(
      (requirement) => requirement.projectId === project.id,
    ),
  );
  const touched: Requirement[] = [];
  const evidence: EvidenceRecord[] = [];
  const scoped = scopedControlsForRefresh(
    project,
    controlIds,
    options.controls,
  );

  for (const control of scoped) {
    refreshRequirementForControl(
      working,
      findings,
      project.id,
      control,
      { ...options, now },
      touched,
      evidence,
    );
  }

  return { requirements: touched, evidence };
}

/**
 * Re-derives requirement statuses for specific controls after a targeted
 * finding event (dismiss, verify, exception clear).
 */
export function refreshRequirementStatusesForControls(
  project: Project,
  findings: ReadonlyArray<Finding>,
  requirements: ReadonlyArray<Requirement>,
  controlIds: readonly string[],
  options: RefreshRequirementStatusesOptions = {},
): RefreshRequirementStatusesResult {
  if (controlIds.length === 0) {
    return { requirements: [], evidence: [] };
  }
  return refreshRequirementStatuses({
    project,
    findings,
    requirements,
    controlIds,
    options,
  });
}

/** Apply a full-scope status refresh into working ProjectRows (assessment). */
export function applyRequirementStatusRefresh(
  rows: ProjectRows,
  project: Project,
  options: RefreshRequirementStatusesOptions = {},
): void {
  const result = refreshRequirementStatuses({
    project,
    findings: rows.findings,
    requirements: rows.requirements,
    options,
  });
  for (const requirement of result.requirements) {
    const index = rows.requirements.findIndex(
      (candidate) => candidate.id === requirement.id,
    );
    if (index >= 0) {
      rows.requirements[index] = requirement;
    } else {
      rows.requirements.push(requirement);
    }
  }
  rows.evidence.push(...result.evidence);
}

/** Merge refresh results onto a ProjectWritePayload (later id wins). */
export function mergeRefreshIntoPayload(
  payload: {
    requirements?: Requirement[];
    evidence?: EvidenceRecord[];
  },
  result: RefreshRequirementStatusesResult,
): void {
  if (result.requirements.length > 0) {
    const byId = new Map(
      (payload.requirements ?? []).map((requirement) => [
        requirement.id,
        requirement,
      ]),
    );
    for (const requirement of result.requirements) {
      byId.set(requirement.id, requirement);
    }
    payload.requirements = [...byId.values()];
  }
  if (result.evidence.length > 0) {
    payload.evidence = [...(payload.evidence ?? []), ...result.evidence];
  }
}

/** Findings list with payload overrides applied (for status refresh after dismiss). */
export function findingsWithPayloadOverrides(
  findings: ReadonlyArray<Finding>,
  overrides: ReadonlyArray<Finding> | undefined,
): Finding[] {
  if (!overrides || overrides.length === 0) return [...findings];
  const byId = new Map(overrides.map((finding) => [finding.id, finding]));
  return findings.map((finding) => byId.get(finding.id) ?? finding);
}
