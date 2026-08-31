import { isRuntimeOnlyCheck } from "@/analysis/check-authority";
import { deriveRequirementStatus } from "@/core/requirement-status";
import type { Finding } from "@/core/finding-types";
import type { RequirementStatus } from "@/core/statuses";
import type { Control, Project, Requirement } from "@/core/project-types";
import { TEMPORARY_EXCEPTION_REASON } from "@/core/project-types";
import { addEvidence, type Db } from "./db";

/** Human exceptions and human passes block automated status overwrite. */
function isStickyHumanDecision(
  requirement: Requirement | undefined,
): boolean {
  if (!requirement || requirement.determination !== "human_review") {
    return false;
  }
  return Boolean(requirement.exception || requirement.humanPass);
}

/**
 * Controls assessed for a project. `undefined` inScopeControlIds means the
 * full catalog; otherwise only the listed control IDs.
 */
export function controlsInScope(db: Db, project: Project): Control[] {
  if (project.inScopeControlIds === undefined) {
    return db.controls;
  }
  const controlIds = new Set(project.inScopeControlIds);
  return db.controls.filter((control) => controlIds.has(control.id));
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
}

function statusFromFindings(
  checkId: string | null,
  openFindings: ReadonlyArray<Pick<Finding, "kind">>,
  runtimeRan: boolean | undefined,
): RequirementStatus {
  if (openFindings.length > 0) {
    return deriveRequirementStatus(openFindings);
  }
  if (checkId !== null && isRuntimeOnlyCheck(checkId) && runtimeRan === false) {
    return "unable_to_verify";
  }
  return deriveRequirementStatus(openFindings);
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
  const { assessmentId, changeContext, runtimeRan } = options;
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
      if (isStickyHumanDecision(requirement)) {
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
    if (isStickyHumanDecision(requirement)) {
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
        },
      });
      requirement.status = status;
      requirement.determination = "automated";
      requirement.updatedAt = now;
    }
  }
}