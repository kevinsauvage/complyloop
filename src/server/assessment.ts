import { latestAssessmentFor } from "@/core/assessment";
import { countByStatus } from "@/core/count-by-status";
import { scanChangedFiles, scanProject } from "@complyloop/analysis-core/scan";
import {
  scanRuntime,
  type RuntimePageScanner,
} from "@complyloop/analysis-core/runtime/scan";
import { DEFAULT_THEME_CONDITIONS } from "@complyloop/analysis-core/runtime/theme-conditions";
import type { DnsLookup } from "@complyloop/analysis-core/runtime/url-safety";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  type Assessment,
  type EvidenceRecord,
  type Finding,
  type Remediation,
} from "@complyloop/db/types";
import type {
  Control,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import { advanceRemediation } from "@/core/remediation";
import {
  REQUIREMENT_STATUSES,
} from "@complyloop/analysis-core/contract/statuses";
import type { Db } from "./db";
import { detectChanges, summarizeChanges } from "./monitor";
import {
  mergeRawFindings,
  reconcileControlFindings,
} from "./assessment-findings";
import {
  applyRequirementStatusRefresh,
  clearExpiredExceptions,
  upsertRequirementsById,
} from "./assessment-status";
import {
  assertAssessableCatalog,
  scopedControlIds,
} from "./project-scope";
import {
  appendEvidence,
  cloneProjectRows,
  type ProjectRows,
} from "./project-rows";
import { remediationEvidenceSummary } from "./remediation-evidence";

interface RuntimeScanEngineInput {
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
  linkCheckRan?: boolean;
  error?: string;
}

function buildAssessmentEngines(
  runtimeConfigured: boolean,
  runtimeRan: boolean,
  runtimeResult: RuntimeScanEngineInput,
): AssessmentEngines {
  const scanFeatures: Array<
    NonNullable<AssessmentEngines["scanFeatures"]>[number]
  > = [];
  if (runtimeRan) {
    if (runtimeResult.siteLevelChecksRan) scanFeatures.push("site_level");
    if (runtimeResult.htmlValidateRan) scanFeatures.push("html_validate");
    if (runtimeResult.linkCheckRan) scanFeatures.push("link_check");
    if (runtimeConfigured) scanFeatures.push("theme_conditions");
  }

  return {
    ast: true,
    runtime: runtimeRan,
    runtimePagesScanned: runtimeResult.pagesScanned,
    scanFeatures: scanFeatures.length > 0 ? scanFeatures : undefined,
    themeConditions: runtimeConfigured ? [...DEFAULT_THEME_CONDITIONS] : undefined,
    runtimeError: runtimeResult.error,
  };
}

export interface RunAssessmentOptions {
  /** Absolute path of the current ephemeral (or test) checkout to scan. */
  rootPath: string;
  /** Injected Playwright/axe scanner for tests. */
  runtimeScanner?: RuntimePageScanner;
  /** Injected DNS lookup for runtime SSRF checks in tests. */
  runtimeLookup?: DnsLookup;
  /**
   * When false this is a preview scan (e.g. a pull-request head) and must not
   * derive persistent compliance decisions: finding resolution stays
   * in-memory for the check summary but remediation auto-verification is
   * skipped, and the worker does not persist the diff. Defaults to true.
   */
  authoritative?: boolean;
  /** Test override; production uses the shipped catalog. */
  controls?: readonly Control[];
}

export interface AssessmentRunResult {
  assessment: Assessment;
  evidence: EvidenceRecord[];
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
}

function verifyDraftPrRemediation(
  rows: ProjectRows,
  finding: Finding,
  assessmentId: string,
): void {
  if (!isSourceLocation(finding.location)) return;
  const remediationIndex = rows.remediations.findIndex(
    (candidate) => candidate.findingId === finding.id,
  );
  const remediation = rows.remediations[remediationIndex];
  if (!remediation || remediation.status !== "approved") return;
  if (remediation.approvalAction !== "create_draft_pull_request") return;

  const implemented = advanceRemediation(
    remediation,
    "implemented",
    "No longer detected by deterministic reassessment after draft PR approval",
  );
  const verified = advanceRemediation(
    implemented,
    "verified",
    "Verified by deterministic reassessment",
  );
  rows.remediations[remediationIndex] = verified;
  const detail = {
    determination: "automated",
    method: "deterministic_reassessment",
  };
  appendEvidence(rows, {
    kind: "remediation_implemented",
    summary: remediationEvidenceSummary("implemented", finding),
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    assessmentId,
    detail,
  });
  appendEvidence(rows, {
    kind: "remediation_verified",
    summary: remediationEvidenceSummary("verified", finding),
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    assessmentId,
    detail,
  });
}

/**
 * Runs assessment against a checkout. Reads the loaded `db` but never mutates
 * it — all writes live on a cloned project-row scratch and are returned for
 * `applyAssessmentPayload` (or test materialization).
 */
export async function runAssessment(
  db: Db,
  projectId: string,
  options: RunAssessmentOptions,
): Promise<AssessmentRunResult> {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new PublicError("Unknown project.");
  const { rootPath } = options;

  const rows = cloneProjectRows(
    db.findings,
    db.remediations,
    db.requirements,
    projectId,
  );
  const cleared = clearExpiredExceptions(rows.requirements, projectId);
  rows.requirements = upsertRequirementsById(
    rows.requirements,
    cleared.requirements,
  );
  rows.evidence.push(...cleared.evidence);

  const startedAt = new Date().toISOString();

  const previous = latestAssessmentFor(db.assessments, projectId);
  const { snapshot, changes } = detectChanges(rootPath, previous?.snapshot);
  const changeContext = changes.length > 0 ? summarizeChanges(changes) : undefined;

  if (changes.length > 0) {
    appendEvidence(rows, {
      kind: "monitoring_changes_detected",
      summary: changeContext ?? summarizeChanges(changes),
      projectId,
      detail: {
        files: changes.map((change) => change.filePath),
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
    ? scanChangedFiles(rootPath, changedJsx)
    : scanProject(rootPath);
  const scopedFileSet = useScoped ? new Set(changedJsx) : null;

  const runtimeConfigured = Boolean(project.runtimeBaseUrl?.trim());
  const runtimeResult = runtimeConfigured
    ? await scanRuntime({
        runtimeBaseUrl: project.runtimeBaseUrl,
        runtimeRoutes: project.runtimeRoutes,
        browserConditions: DEFAULT_THEME_CONDITIONS,
        scanner: options.runtimeScanner,
        lookup: options.runtimeLookup,
      })
    : { findings: [], pagesScanned: 0 };
  const runtimeRan =
    runtimeConfigured &&
    runtimeResult.error === undefined &&
    runtimeResult.pagesScanned > 0;

  const engines = buildAssessmentEngines(
    runtimeConfigured,
    runtimeRan,
    runtimeResult,
  );

  const rawFindings = mergeRawFindings(
    astFindings,
    runtimeResult.findings,
    runtimeRan,
  );

  const assessmentId = crypto.randomUUID();
  const scoped = assertAssessableCatalog(project, options.controls);

  for (const control of scoped) {
    if (control.checkId === null) continue;
    reconcileControlFindings({
      rows,
      project,
      control,
      assessmentId,
      rootPath,
      rawForControl: rawFindings.filter(
        (raw) => raw.checkId === control.checkId,
      ),
      scopedFileSet,
      runtimeRan,
      // A preview scan (PR head / feature branch) must not derive the
      // persistent compliance decision: never auto-verify an approved
      // remediation off a branch the project's state does not reflect.
      onFindingResolved:
        options.authoritative === false
          ? () => {}
          : (finding) => verifyDraftPrRemediation(rows, finding, assessmentId),
    });
  }

  applyRequirementStatusRefresh(rows, project, {
    assessmentId,
    changeContext,
    runtimeRan,
    siteLevelChecksRan: runtimeResult.siteLevelChecksRan,
    htmlValidateRan: runtimeResult.htmlValidateRan,
    applicabilityFacts: runtimeResult.applicabilityFacts,
    controls: options.controls,
  });

  const inScope = scopedControlIds(project);
  const scopedRequirements = rows.requirements.filter(
    (requirement) => !inScope || inScope.has(requirement.controlId),
  );
  const summary = countByStatus(scopedRequirements, REQUIREMENT_STATUSES);

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

  const engineSummary = runtimeConfigured
    ? runtimeRan
      ? `; runtime ${runtimeResult.pagesScanned} page(s)`
      : `; runtime skipped (${runtimeResult.error ?? "no pages"})`
    : "";

  appendEvidence(rows, {
    kind: "assessment_completed",
    summary: `Assessment of "${project.name}": ${filesScanned} files scanned (${scanMode})${engineSummary} — ${summary.passed} passed, ${summary.failed} failed, ${summary.needs_review} need review, ${summary.unable_to_verify} unable to verify${changes.length > 0 ? `; ${changes.length} file(s) changed since previous` : ""}`,
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

  return {
    assessment,
    evidence: rows.evidence,
    findings: rows.findings,
    remediations: rows.remediations,
    requirements: rows.requirements,
  };
}
