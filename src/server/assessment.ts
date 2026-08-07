import { guidanceFor } from "@/adapters/rgaa/guidance";
import { deterministicExplanation } from "@/ai/explainer";
import { isCompositionSensitiveCheck } from "@/analysis/check-authority";
import { scanChangedFiles, scanProject } from "@/analysis/scan";
import {
  scanRuntime,
  type RuntimePageScanner,
} from "@/analysis/runtime/scan";
import type { RawFinding } from "@/analysis/types";
import { formatLocationRef } from "@/core/location";
import type {
  Assessment,
  AssessmentEngines,
  Finding,
  Project,
  Remediation,
  RequirementStatus,
} from "@/core/types";
import { addEvidence, type Db } from "./db";
import { detectChanges, summarizeChanges } from "./monitor";
import {
  buildSuggestion,
  filterAstFindingsForAuthority,
  findingLocationMatchesScope,
  mergeFix,
  sameInstance,
} from "./assessment-helpers";
import {
  clearExpiredExceptions,
  controlsInScope,
  refreshRequirementStatuses,
} from "./assessment-status";

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
    engine: raw.engine ?? "ast",
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
    summary: `${raw.checkId}: ${formatLocationRef(raw.location)} — ${raw.reason}`,
    projectId: project.id,
    controlId,
    findingId: finding.id,
    assessmentId,
    detail: { engine: raw.engine ?? "ast" },
  });
}

function mergeRawFindings(
  astFindings: RawFinding[],
  runtimeFindings: RawFinding[],
  runtimeRan: boolean,
): RawFinding[] {
  const filteredAst = filterAstFindingsForAuthority(
    astFindings,
    runtimeRan,
  ).map((finding) => ({ ...finding, engine: finding.engine ?? ("ast" as const) }));
  return [...filteredAst, ...runtimeFindings];
}

export interface RunAssessmentOptions {
  /** Injected Playwright/axe scanner for tests. */
  runtimeScanner?: RuntimePageScanner;
}

export async function runAssessment(
  db: Db,
  projectId: string,
  options: RunAssessmentOptions = {},
): Promise<Assessment> {
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
            changes
              .map((change) => change.author)
              .filter((author): author is string => Boolean(author)),
          ),
        ],
        previousGitHead: previous?.snapshot?.gitHead,
        gitHead: snapshot.gitHead,
      },
    });
  }

  const changedJsx = changes
    .map((change) => change.filePath)
    .filter((filePath) => /\.(tsx|jsx)$/i.test(filePath));
  const useScoped = Boolean(previous?.snapshot) && changedJsx.length > 0;
  const {
    findings: astFindings,
    filesScanned,
    scanMode,
  } = useScoped
    ? scanChangedFiles(project.rootPath, changedJsx)
    : scanProject(project.rootPath);
  const scopedFileSet = useScoped ? new Set(changedJsx) : null;

  const runtimeConfigured = Boolean(project.runtimeBaseUrl?.trim());
  const runtimeResult = runtimeConfigured
    ? await scanRuntime({
        runtimeBaseUrl: project.runtimeBaseUrl,
        runtimeRoutes: project.runtimeRoutes,
        scanner: options.runtimeScanner,
      })
    : { findings: [], pagesScanned: 0 };
  const runtimeRan =
    runtimeConfigured &&
    runtimeResult.error === undefined &&
    runtimeResult.pagesScanned > 0;

  const engines: AssessmentEngines = {
    ast: true,
    runtime: runtimeRan,
    runtimePagesScanned: runtimeResult.pagesScanned,
    runtimeError: runtimeResult.error,
  };

  const rawFindings = mergeRawFindings(
    astFindings,
    runtimeResult.findings,
    runtimeRan,
  );

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
        existing.engine = raw.engine ?? existing.engine ?? "ast";
      } else {
        createFinding(db, project, control.id, assessmentId, raw);
      }
    }

    for (const finding of openFindings) {
      if (matchedIds.has(finding.id)) continue;
      // Scoped AST scans must not resolve findings outside the changed file set.
      if (!findingLocationMatchesScope(finding.location, scopedFileSet)) {
        continue;
      }
      // When runtime owns this check, do not resolve prior AST-only opens mid-flight
      // on a failed runtime scan — only resolve when we have authority this run.
      if (
        runtimeConfigured &&
        !runtimeRan &&
        isCompositionSensitiveCheck(finding.checkId) &&
        finding.engine === "runtime"
      ) {
        continue;
      }
      finding.status = "resolved";
      finding.resolvedNote = "No longer detected by the latest assessment.";
      addEvidence(db, {
        kind: "finding_resolved",
        summary: `${finding.checkId}: ${formatLocationRef(finding.location)} no longer detected`,
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
    scanMode,
    engines,
    summary,
    snapshot,
    changesSincePrevious: changes,
  };
  db.assessments.push(assessment);

  const engineSummary = runtimeConfigured
    ? runtimeRan
      ? `; runtime ${runtimeResult.pagesScanned} page(s)`
      : `; runtime skipped (${runtimeResult.error ?? "no pages"})`
    : "";

  addEvidence(db, {
    kind: "assessment_completed",
    summary: `Assessment of "${project.name}": ${filesScanned} files scanned (${scanMode})${engineSummary}${summary.passed !== undefined ? ` — ${summary.passed} passed, ${summary.failed} failed, ${summary.needs_review} need review` : ""}${changes.length > 0 ? `; ${changes.length} file(s) changed since previous` : ""}`,
    projectId,
    assessmentId,
    detail: {
      ...summary,
      filesScanned,
      scanMode,
      engines,
      changedFiles: changes.map((change) => change.filePath),
    },
  });

  return assessment;
}
