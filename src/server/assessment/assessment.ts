import "server-only";

import { checkRegistrySignature } from "@complyloop/analysis-core/checks/registry";
import {
  type Assessment,
  type AssessmentSnapshot,
  type EvidenceRecord,
  type FileChange,
  type Finding,
  type Remediation,
  type Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { mergeRawFindings } from "@complyloop/analysis-core/merge-findings";
import {
  type RuntimePageScanner,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import { DEFAULT_THEME_CONDITIONS } from "@complyloop/analysis-core/runtime/theme-conditions";
import type { DnsLookup } from "@complyloop/analysis-core/runtime/url-safety";
import { scanChangedFiles, scanProject } from "@complyloop/analysis-core/scan";
import type { RawFinding } from "@complyloop/analysis-core/types";

import { countByStatus, latestAssessmentFor } from "@/core/assessment-helpers";
import { advanceRemediation } from "@/core/remediation-lifecycle";

import { reportWarning } from "../observability";
import {
  assertAssessableCatalog,
  requirementsInScope,
} from "../workspace/project-scope";
import { reconcileControlFindings } from "./assessment-findings";
import {
  appendEvidence,
  type AssessmentPipelineInput,
  createAssessmentScratch,
  type ProjectRows,
} from "./assessment-pipeline";
import { applyRequirementStatusRefresh } from "./assessment-status";
import { detectChanges, readRepoHead, summarizeChanges } from "./monitor";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "./remediation-evidence";

interface RuntimeScanEngineInput {
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
  linkCheckRan?: boolean;
  error?: string;
}

/**
 * AST checks whose verdict can depend on files beyond the one scanned
 * (document order, cross-node structure, id uniqueness). A scoped re-scan of
 * only changed files cannot confirm or clear these — any run assessing them
 * (or any run that deleted a file) must scan the full tree.
 */
const STRUCTURAL_CHECK_IDS: ReadonlySet<string> = new Set([
  "heading-order",
  "list-structure",
  "duplicate-id",
]);

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
    themeConditions: runtimeConfigured
      ? [...DEFAULT_THEME_CONDITIONS]
      : undefined,
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

/** Re-scan scope proof for draft-PR auto-verification. */
export interface DraftPrVerifyScope {
  /**
   * Files this run re-scanned (`null` after a full-tree scan). A resolve only
   * counts as fix-confirmed when the finding's file is among them.
   */
  scopedFileSet: Set<string> | null;
  /** True when sources were reused without any scan — nothing was re-checked. */
  sourcesUnchanged: boolean;
}

/** Exported for unit tests of the re-scan scope guard. */
export function verifyDraftPrRemediation(
  rows: ProjectRows,
  finding: Finding,
  assessmentId: string,
  scope: DraftPrVerifyScope,
): void {
  if (!isSourceLocation(finding.location)) return;
  const remediationIndex = rows.remediations.findIndex(
    (candidate) => candidate.findingId === finding.id,
  );
  const remediation = rows.remediations[remediationIndex];
  if (!remediation || remediation.status !== "approved") return;
  if (remediation.approvalAction !== "create_draft_pull_request") return;

  // A reconcile resolve is only a confirmed fix when the finding's location
  // was actually re-scanned this run: full scans re-check the whole tree,
  // scoped scans must include the finding's file. Otherwise the resolve may
  // come from an identity mismatch — skip auto-verify instead of advancing.
  if (scope.sourcesUnchanged) {
    reportWarning(
      "Skipping draft-PR auto-verify: sources unchanged, finding was not re-scanned",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
      },
    );
    return;
  }
  if (
    scope.scopedFileSet !== null &&
    !scope.scopedFileSet.has(finding.location.filePath)
  ) {
    reportWarning(
      "Skipping draft-PR auto-verify: finding file outside the re-scanned scope",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
        filePath: finding.location.filePath,
      },
    );
    return;
  }

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
  const detail = remediationEvidenceDetail({
    determination: "automated",
    method: "deterministic_reassessment",
  });
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
 * Runs assessment against a checkout. Takes the narrow pipeline input
 * (project + project-scoped rows — never the full tenancy `WorkspaceSlice`).
 * Reads the input but never mutates it — all writes live on an
 * assessment-owned scratch (see `assessment-pipeline.ts`) and are returned
 * for `applyAssessmentPayload` (or test materialization).
 *
 * Stage sequence: (1) scratch → (2) change detection → (3) AST scan →
 * (4) runtime scan → (5) merge → (6) reconcile findings → (7) refresh
 * statuses → (8) build assessment record.
 */
export async function runAssessment(
  input: AssessmentPipelineInput,
  options: RunAssessmentOptions,
): Promise<AssessmentRunResult> {
  const { project } = input;
  const projectId = project.id;
  const { rootPath } = options;

  // — Stage 1: scratch rows (clone + clear expired exceptions). —
  const rows = createAssessmentScratch(input);

  const startedAt = new Date().toISOString();

  // — Stage 2: change detection (snapshot + changed files). —
  const previous = latestAssessmentFor(input.assessments, projectId);
  const scoped = assertAssessableCatalog(project, options.controls);
  // Reuse prior AST findings only when the commit, control scope, and engine
  // behavior version/check set are all unchanged. Any difference forces a real
  // scan so new/changed checks (or a bumped ANALYSIS_ENGINE_VERSION) are not
  // silently missed.
  const snapshotKey = `${checkRegistrySignature()}#${scoped
    .map((control) => control.id)
    .sort()
    .join(",")}`;
  const head = readRepoHead(rootPath);
  const sourcesUnchanged =
    previous?.snapshot?.gitHead !== undefined &&
    head !== undefined &&
    previous.snapshot.gitHead === head &&
    previous.snapshot.controlScopeKey === snapshotKey;

  let snapshot: AssessmentSnapshot;
  let changes: FileChange[];
  if (sourcesUnchanged && previous?.snapshot) {
    snapshot = { ...previous.snapshot };
    changes = [];
  } else {
    const detected = detectChanges(rootPath, previous?.snapshot);
    snapshot = detected.snapshot;
    changes = detected.changes;
  }
  snapshot.controlScopeKey = snapshotKey;
  const changeContext =
    changes.length > 0 ? summarizeChanges(changes) : undefined;

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
  // Files the previous snapshot knew but the current tree no longer has.
  // `changes` already lists them (detectChanges adds missing paths), but the
  // resolve scope must name them explicitly: a deleted file is never scanned,
  // so its findings only clear when the file is in the invalidation set.
  const deletedFiles = previous?.snapshot
    ? Object.keys(previous.snapshot.fileHashes).filter(
        (filePath) => snapshot.fileHashes[filePath] === undefined,
      )
    : [];
  const deletedJsx = deletedFiles.filter((filePath) =>
    /\.(tsx|jsx)$/i.test(filePath),
  );
  const hasDeletion = deletedFiles.length > 0;
  const hasStructuralChecks = scoped.some(
    (control) =>
      control.checkId !== null && STRUCTURAL_CHECK_IDS.has(control.checkId),
  );
  // Structural verdicts can shift with any cross-file change and deletions
  // invalidate per-file assumptions outright — both force a full-tree scan
  // with an unbounded resolve scope instead of a scoped re-scan.
  const forceFullScan = hasDeletion || hasStructuralChecks;
  const useScoped =
    Boolean(previous?.snapshot) && changedJsx.length > 0 && !forceFullScan;

  let astFindings: RawFinding[] = [];
  let filesScanned: number;
  let scanMode: "full" | "scoped";
  // — Stage 3: AST scan (full / scoped / reuse when sources unchanged). —
  if (sourcesUnchanged) {
    // Sources, scope, and engine set are identical to the last run: keep the
    // existing AST findings and skip the full-tree scan. Runtime checks still
    // run and reconcile their own findings below.
    filesScanned = previous?.filesScanned ?? 0;
    scanMode = "scoped";
  } else if (useScoped) {
    const scopedScan = scanChangedFiles(rootPath, changedJsx);
    astFindings = scopedScan.findings;
    filesScanned = scopedScan.filesScanned;
    scanMode = scopedScan.scanMode;
  } else {
    const fullScan = scanProject(rootPath);
    astFindings = fullScan.findings;
    filesScanned = fullScan.filesScanned;
    scanMode = fullScan.scanMode;
  }
  const scopedFileSet = sourcesUnchanged
    ? new Set<string>()
    : useScoped
      ? new Set([...changedJsx, ...deletedJsx])
      : null;

  // — Stage 4: runtime scan (only when a preview URL is configured). —
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
  if (runtimeConfigured && !runtimeRan) {
    // A failed runtime sub-scan does not fail the job, so without this the
    // classified cause only lands in evidence — invisible in Vercel logs and
    // Sentry. Origin only, never the full URL (preview tokens).
    let previewOrigin: string | undefined;
    try {
      previewOrigin = new URL(project.runtimeBaseUrl as string).origin;
    } catch {
      previewOrigin = undefined;
    }
    reportWarning("runtime scan did not run", {
      code: "assessment_runtime_skipped",
      projectId,
      error: runtimeResult.error ?? "no pages",
      pagesScanned: runtimeResult.pagesScanned,
      previewOrigin,
    });
  }

  const engines = buildAssessmentEngines(
    runtimeConfigured,
    runtimeRan,
    runtimeResult,
  );

  // — Stage 5: merge AST + runtime findings (dedupe, authority). —
  const rawFindings = mergeRawFindings(
    astFindings,
    runtimeResult.findings,
    runtimeRan,
  );

  const assessmentId = crypto.randomUUID();
  // Shared for the whole run: many new findings share a source file, so the
  // suggestion builder should read each file once (see buildSuggestion).
  const fileTextCache = new Map<string, string>();

  // — Stage 6: reconcile per-control findings (match / create / resolve). —
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
      fileTextCache,
      // A preview scan (PR head / feature branch) must not derive the
      // persistent compliance decision: never auto-verify an approved
      // remediation off a branch the project's state does not reflect.
      onFindingResolved:
        options.authoritative === false
          ? () => {}
          : (finding) =>
              verifyDraftPrRemediation(rows, finding, assessmentId, {
                scopedFileSet,
                sourcesUnchanged,
              }),
    });
  }

  // — Stage 7: refresh requirement statuses + summarize. —
  applyRequirementStatusRefresh(rows, project, {
    assessmentId,
    changeContext,
    runtimeRan,
    siteLevelChecksRan: runtimeResult.siteLevelChecksRan,
    htmlValidateRan: runtimeResult.htmlValidateRan,
    applicabilityFacts: runtimeResult.applicabilityFacts,
    filesScanned,
    controls: options.controls,
  });

  const scopedRequirements = requirementsInScope(rows.requirements, project);
  const summary = countByStatus(scopedRequirements, REQUIREMENT_STATUSES);

  // — Stage 8: build the assessment record + completion evidence. —
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
