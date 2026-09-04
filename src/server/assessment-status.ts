import { presetById } from "@/adapters/registry";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  deriveRequirementStatus,
  isStickyHumanDecision,
} from "@complyloop/analysis-core/contract/requirement-status";
import {
  authorityForCheck,
  isHtmlValidateOwnedCheck,
} from "@complyloop/analysis-core/check-authority";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type { Control, Project, Requirement } from "@/core/project-types";
import { TEMPORARY_EXCEPTION_REASON } from "@/core/project-types";
import { addEvidence, type Db } from "./db";

/**
 * Control IDs this project assesses. A named preset always uses the live
 * catalog membership so new rules apply without rewriting stored snapshots.
 * Custom subsets (no preset) use `inScopeControlIds`. `undefined` means
 * the whole catalog.
 */
export function scopedControlIds(
  project: Project,
): ReadonlySet<string> | undefined {
  const presetId = project.defaultPresetId;
  if (presetId) {
    const preset = presetById(presetId);
    if (preset) return new Set(preset.controlIds);
  }
  if (project.inScopeControlIds === undefined) return undefined;
  return new Set(project.inScopeControlIds);
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
 */
export function controlsInScope(db: Db, project: Project): Control[] {
  const controlIds = scopedControlIds(project);
  if (!controlIds) return db.controls;
  return db.controls.filter((control) => controlIds.has(control.id));
}

/** Fails loud when the catalog or preset scope would produce a no-op assessment. */
export function assertAssessableCatalog(
  db: Db,
  project: Project,
): Control[] {
  const scoped = controlsInScope(db, project);
  if (scoped.length > 0) return scoped;
  throw new PublicError(
    db.controls.length === 0
      ? "Compliance catalog is not seeded. Run `npm run seed`, then re-run the assessment."
      : "No controls are in scope for this project. Check the assessment preset in Settings.",
  );
}

/** Requirements for a project that fall inside its assessment target. */
export function requirementsInScope(
  requirements: ReadonlyArray<Requirement>,
  project: Project,
): Requirement[] {
  const forProject = requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
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
  const forProject = findings.filter(
    (finding) => finding.projectId === project.id,
  );
  const controlIds = scopedControlIds(project);
  if (!controlIds) return forProject;
  return forProject.filter((finding) => controlIds.has(finding.controlId));
}

/**
 * Clears temporary exceptions whose expiresAt is in the past, recording
 * evidence so the sticky human decision is historized rather than deleted.
 */
export function clearExpiredExceptions(
  db: Db,
  projectId: string,
  now = new Date(),
): void {
  for (const requirement of db.requirements) {
    if (requirement.projectId !== projectId) continue;
    const exception = requirement.exception;
    if (
      !exception ||
      exception.reason !== TEMPORARY_EXCEPTION_REASON ||
      !exception.expiresAt
    ) {
      continue;
    }
    if (new Date(exception.expiresAt).getTime() > now.getTime()) continue;

    const control = db.controls.find(
      (candidate) => candidate.id === requirement.controlId,
    );
    delete requirement.exception;
    requirement.determination = "automated";
    requirement.updatedAt = now.toISOString();
    addEvidence(db, {
      kind: "requirement_exception_cleared",
      summary: `${control?.code ?? requirement.controlId} temporary exception expired`,
      projectId,
      controlId: requirement.controlId,
      detail: { previousException: exception, expired: true },
    });
  }
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
}

/**
 * Delegates all derivation to core (single source of truth). The adapter maps
 * the analysis-layer check id to the framework-agnostic authority class via
 * the authoritative classifier in `check-authority.ts`.
 */
function statusFromFindings(
  checkId: string | null,
  openFindings: ReadonlyArray<Pick<Finding, "kind">>,
  runtimeRan: boolean | undefined,
  siteLevelChecksRan: boolean | undefined,
  htmlValidateRan: boolean | undefined,
  applicabilityFacts: ReadonlyMap<string, string> | undefined,
): RequirementStatus {
  return deriveRequirementStatus({
    authority: checkId === null ? "manual" : authorityForCheck(checkId),
    openFindings,
    runtimeRan,
    siteLevelChecksRan,
    htmlValidateRequired:
      checkId !== null && isHtmlValidateOwnedCheck(checkId),
    htmlValidateRan,
    applicabilityConfirmed:
      checkId !== null && Boolean(applicabilityFacts?.has(checkId)),
  });
}

/**
 * Re-derives requirement statuses from the findings currently open in the db,
 * recording status changes (and regressions) as evidence. Used both after a
 * full assessment and after single-finding events like verification.
 */
export function refreshRequirementStatuses(
  db: Db,
  projectId: string,
  options: RefreshRequirementStatusesOptions = {},
): void {
  const { assessmentId, changeContext, runtimeRan, siteLevelChecksRan, htmlValidateRan, applicabilityFacts } =
    options;
  const now = new Date().toISOString();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  const scoped = project ? controlsInScope(db, project) : db.controls;

  for (const control of scoped) {
    if (control.checkId === null) {
      // Manual / custom controls without a check stay unable_to_verify unless
      // a human pass or exception already sets a different status.
      const requirement = db.requirements.find(
        (candidate) =>
          candidate.projectId === projectId && candidate.controlId === control.id,
      );
      if (requirementIsSticky(requirement)) {
        continue;
      }
      if (!requirement) {
        db.requirements.push({
          id: crypto.randomUUID(),
          projectId,
          controlId: control.id,
          status: "unable_to_verify",
          determination: "automated",
          updatedAt: now,
        });
      } else if (requirement.status !== "unable_to_verify") {
        requirement.status = "unable_to_verify";
        requirement.determination = "automated";
        requirement.updatedAt = now;
      }
      continue;
    }

    let requirement = db.requirements.find(
      (candidate) =>
        candidate.projectId === projectId && candidate.controlId === control.id,
    );
    // Human exceptions / human passes are sticky until explicitly cleared
    // (temporary exceptions may expire earlier — see clearExpiredExceptions).
    if (requirementIsSticky(requirement)) {
      continue;
    }

    const openFindings = db.findings.filter(
      (finding) =>
        finding.projectId === projectId &&
        finding.controlId === control.id &&
        finding.status === "open",
    );
    const status = statusFromFindings(
      control.checkId,
      openFindings,
      runtimeRan,
      siteLevelChecksRan,
      htmlValidateRan,
      applicabilityFacts,
    );

    if (!requirement) {
      requirement = {
        id: crypto.randomUUID(),
        projectId,
        controlId: control.id,
        status,
        determination: "automated",
        updatedAt: now,
      };
      db.requirements.push(requirement);
      continue;
    }

    if (requirement.status !== status) {
      const regression = requirement.status === "passed" && status === "failed";
      const attribution =
        regression && changeContext ? ` — ${changeContext}` : "";
      addEvidence(db, {
        kind: "requirement_status_changed",
        summary: `${control.code} (${control.title}): ${requirement.status} → ${status}${regression ? " — compliance regression" : ""}${attribution}`,
        projectId,
        controlId: control.id,
        assessmentId,
        detail: {
          from: requirement.status,
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
      });
      requirement.status = status;
      requirement.determination = "automated";
      requirement.updatedAt = now;
    }
  }
}