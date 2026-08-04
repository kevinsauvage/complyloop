import fs from "node:fs";
import path from "node:path";
import { guidanceFor } from "@/adapters/rgaa/guidance";
import { deterministicExplanation } from "@/ai/explainer";
import { describeFix, previewFixedLine } from "@/analysis/fixes";
import { scanProject } from "@/analysis/scan";
import type { RawFinding } from "@/analysis/types";
import { deriveRequirementStatus } from "@/core/requirement-status";
import type {
  Assessment,
  Control,
  Finding,
  Project,
  ProposedFix,
  Remediation,
  RemediationSuggestion,
  RequirementStatus,
} from "@/core/types";
import { addEvidence, type Db } from "./db";
import { detectChanges, summarizeChanges } from "./monitor";

/**
 * Findings are matched across assessments by file plus snippet (or line as a
 * fallback) so remediation state survives re-assessment and dismissals stick.
 */
function sameInstance(
  finding: Pick<Finding, "location">,
  raw: RawFinding,
): boolean {
  return (
    finding.location.filePath === raw.location.filePath &&
    (finding.location.snippet === raw.location.snippet ||
      finding.location.line === raw.location.line)
  );
}

/** Carries a human-edited fix value over to the freshly scanned fix. */
export function mergeFix(
  existing: ProposedFix | null,
  fresh: ProposedFix | null,
): ProposedFix | null {
  if (
    existing?.kind === "insert_attribute" &&
    fresh?.kind === "insert_attribute" &&
    existing.editable
  ) {
    return { ...fresh, value: existing.value };
  }
  return fresh;
}

export function buildSuggestion(
  project: Project,
  raw: Pick<RawFinding, "location" | "fix">,
): RemediationSuggestion | null {
  if (!raw.fix) return null;
  const text = fs.readFileSync(
    path.join(project.rootPath, raw.location.filePath),
    "utf8",
  );
  return {
    description: describeFix(raw.fix),
    proposedSnippet: previewFixedLine(text, raw.fix, raw.location.line),
    provenance: "deterministic",
    confidence: "high",
    generatedAt: new Date().toISOString(),
  };
}

/** Controls assessed for a project; undefined scope means every control. */
export function controlsInScope(db: Db, project: Project): Control[] {
  if (!project.inScopeControlIds) return db.controls;
  const allowed = new Set(project.inScopeControlIds);
  return db.controls.filter((control) => allowed.has(control.id));
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
    if (!exception || exception.reason !== "temporary" || !exception.expiresAt) {
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

function createFinding(
  db: Db,
  project: Project,
  controlId: string,
  assessmentId: string,
  raw: RawFinding,
): void {
  const now = new Date().toISOString();
  const guidance = guidanceFor(raw.checkId) ?? {
    impact: "Impact not documented for this check.",
    howToFix: "See the requirement description.",
  };
  const finding: Finding = {
    id: crypto.randomUUID(),
    projectId: project.id,
    controlId,
    assessmentId,
    checkId: raw.checkId,
    status: "open",
    kind: raw.kind,
    severity: raw.severity,
    confidence: raw.confidence,
    reason: raw.reason,
    location: raw.location,
    fix: raw.fix,
    explanations: [deterministicExplanation(raw.reason, guidance)],
    detectedAt: now,
  };
  db.findings.push(finding);

  const suggestion = buildSuggestion(project, raw);
  const remediation: Remediation = {
    id: crypto.randomUUID(),
    findingId: finding.id,
    status: suggestion ? "suggested" : "detected",
    suggestion,
    history: suggestion
      ? [
          { status: "detected", at: now },
          { status: "suggested", at: now, note: suggestion.description },
        ]
      : [{ status: "detected", at: now }],
  };
  db.remediations.push(remediation);

  addEvidence(db, {
    kind: "finding_detected",
    summary: `${raw.checkId}: ${raw.location.filePath}:${raw.location.line} — ${raw.reason}`,
    projectId: project.id,
    controlId,
    findingId: finding.id,
    assessmentId,
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
  assessmentId?: string,
  changeContext?: string,
): void {
  const now = new Date().toISOString();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  const scoped = project ? controlsInScope(db, project) : db.controls;

  for (const control of scoped) {
    if (control.checkId === null) {
      // Manual / custom controls without a check stay unable_to_verify unless
      // a human exception already sets a different status.
      const requirement = db.requirements.find(
        (candidate) =>
          candidate.projectId === projectId && candidate.controlId === control.id,
      );
      if (requirement?.exception && requirement.determination === "human_review") {
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
      } else if (
        !requirement.exception &&
        requirement.status !== "unable_to_verify"
      ) {
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
    // Human exceptions (N/A, accepted risk, compensating, temporary) are sticky
    // until explicitly cleared or (for temporary) expired.
    if (requirement?.exception && requirement.determination === "human_review") {
      continue;
    }

    const openFindings = db.findings.filter(
      (finding) =>
        finding.projectId === projectId &&
        finding.controlId === control.id &&
        finding.status === "open",
    );
    const status = deriveRequirementStatus(openFindings);

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

export function runAssessment(db: Db, projectId: string): Assessment {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error(`Unknown project: ${projectId}`);

  const startedAt = new Date().toISOString();
  clearExpiredExceptions(db, projectId);

  const previous = [...db.assessments]
    .reverse()
    .find((assessment) => assessment.projectId === projectId);
  const { snapshot, changes } = detectChanges(project.rootPath, previous?.snapshot);
  const changeContext = changes.length > 0 ? summarizeChanges(changes) : undefined;

  if (changes.length > 0) {
    addEvidence(db, {
      kind: "monitoring_changes_detected",
      summary: changeContext ?? summarizeChanges(changes),
      projectId,
      detail: {
        files: changes.map((change) => change.filePath),
        authors: [
          ...new Set(
            changes.map((change) => change.author).filter(Boolean) as string[],
          ),
        ],
        previousGitHead: previous?.snapshot?.gitHead,
        gitHead: snapshot.gitHead,
      },
    });
  }

  const { findings: rawFindings, filesScanned } = scanProject(project.rootPath);
  const assessmentId = crypto.randomUUID();
  const scoped = controlsInScope(db, project);

  for (const control of scoped) {
    if (control.checkId === null) continue;
    const rawForControl = rawFindings.filter(
      (raw) => raw.checkId === control.checkId,
    );
    const openFindings = db.findings.filter(
      (finding) =>
        finding.projectId === projectId &&
        finding.controlId === control.id &&
        finding.status === "open",
    );
    const dismissedFindings = db.findings.filter(
      (finding) =>
        finding.projectId === projectId &&
        finding.controlId === control.id &&
        finding.status === "dismissed",
    );

    const matchedIds = new Set<string>();
    for (const raw of rawForControl) {
      if (dismissedFindings.some((finding) => sameInstance(finding, raw))) {
        continue;
      }
      const existing = openFindings.find(
        (finding) => !matchedIds.has(finding.id) && sameInstance(finding, raw),
      );
      if (existing) {
        matchedIds.add(existing.id);
        existing.assessmentId = assessmentId;
        existing.fix = mergeFix(existing.fix, raw.fix);
        existing.location = raw.location;
      } else {
        createFinding(db, project, control.id, assessmentId, raw);
      }
    }

    for (const finding of openFindings) {
      if (matchedIds.has(finding.id)) continue;
      finding.status = "resolved";
      finding.resolvedNote = "No longer detected by the latest assessment.";
      addEvidence(db, {
        kind: "finding_resolved",
        summary: `${finding.checkId}: ${finding.location.filePath}:${finding.location.line} no longer detected`,
        projectId,
        controlId: control.id,
        findingId: finding.id,
        assessmentId,
      });
    }
  }

  refreshRequirementStatuses(db, projectId, assessmentId, changeContext);

  const summary: Record<RequirementStatus, number> = {
    passed: 0,
    failed: 0,
    needs_review: 0,
    not_applicable: 0,
    unable_to_verify: 0,
  };
  for (const requirement of db.requirements) {
    if (requirement.projectId !== projectId) continue;
    if (
      project.inScopeControlIds &&
      !project.inScopeControlIds.includes(requirement.controlId)
    ) {
      continue;
    }
    summary[requirement.status] += 1;
  }

  const assessment: Assessment = {
    id: assessmentId,
    projectId,
    startedAt,
    completedAt: new Date().toISOString(),
    filesScanned,
    summary,
    snapshot,
    changesSincePrevious: changes,
  };
  db.assessments.push(assessment);
  addEvidence(db, {
    kind: "assessment_completed",
    summary: `Assessment of "${project.name}": ${filesScanned} files scanned — ${summary.passed} passed, ${summary.failed} failed, ${summary.needs_review} need review${changes.length > 0 ? `; ${changes.length} file(s) changed since previous` : ""}`,
    projectId,
    assessmentId,
    detail: {
      ...summary,
      filesScanned,
      changedFiles: changes.map((change) => change.filePath),
    },
  });

  return assessment;
}
