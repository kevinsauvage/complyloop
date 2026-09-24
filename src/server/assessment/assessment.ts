import "server-only";

import fs from "node:fs";

import { requiresFullTreeScan } from "@complyloop/analysis-core/check-authority";
import { checkRegistrySignature } from "@complyloop/analysis-core/checks/registry";
import {
  type Assessment,
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
import { resolveInside } from "@complyloop/analysis-core/workspace-path";

import {
  countByStatus,
  hasPreviewUrl,
  latestAssessmentFor,
} from "@/core/assessment/assessment-helpers";
import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";
import { advanceRemediation } from "@/core/requirements/remediation-lifecycle";

import { reportEvent, reportWarning } from "../observability";
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
import { buildRuntimeCoverage } from "./runtime-coverage";

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
  /**
   * Stage hook for worker progress reporting. Called synchronously at each
   * pipeline stage boundary with the stage the run is entering — the worker
   * passes a fire-and-forget job-payload writer. Must never throw: a progress
   * callback failure must not fail the assessment (guarded at the call site).
   */
  onStage?: (stage: AssessmentJobStage) => void;
}

export interface AssessmentRunResult {
  assessment: Assessment;
  evidence: EvidenceRecord[];
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  /** Wall-clock ms per pipeline stage (changedetection/ast/runtime/reconcile). */
  stageMs: Record<string, number>;
}

/** Re-scan scope proof for auto-verification on resolve. */
export interface ResolveVerifyScope {
  /**
   * Files this run re-scanned (`null` after a full-tree scan). A resolve only
   * counts as fix-confirmed when the finding's file is among them.
   */
  scopedFileSet: Set<string> | null;
  /** True when sources were reused without any scan — nothing was re-checked. */
  sourcesUnchanged: boolean;
  /** Checkout the run scanned — backs the deletion proof below. */
  rootPath: string;
  /** Test seam for the checkout existence check. */
  fileExists?: (filePath: string) => boolean;
}

function fileExistsInCheckout(rootPath: string, filePath: string): boolean {
  try {
    return fs.existsSync(resolveInside(rootPath, filePath));
  } catch {
    return false;
  }
}

/**
 * Auto-verifies a remediation whose finding resolved with positive proof (see
 * below). Exported for unit tests of the re-scan scope guard.
 *
 * Applies to any `approved` or `implemented` remediation regardless of how it
 * was approved (draft PR, bulk approve, manual approve): the proof strength
 * is identical — the violation is gone from a re-scanned file with no
 * same-file sibling — so only PR-flow approvals verifying would leave every
 * other approval stuck short of `verified` forever.
 */
export function verifyRemediationOnResolve(
  rows: ProjectRows,
  finding: Finding,
  assessmentId: string,
  scope: ResolveVerifyScope,
): void {
  if (!isSourceLocation(finding.location)) return;
  const remediationIndex = rows.remediations.findIndex(
    (candidate) => candidate.findingId === finding.id,
  );
  const remediation = rows.remediations[remediationIndex];
  if (
    !remediation ||
    (remediation.status !== "approved" && remediation.status !== "implemented")
  ) {
    return;
  }

  // A reconcile resolve is only a confirmed fix when the finding's location
  // was actually re-scanned this run: full scans re-check the whole tree,
  // scoped scans must include the finding's file. Otherwise the resolve may
  // come from an identity mismatch — skip auto-verify instead of advancing.
  if (scope.sourcesUnchanged) {
    reportWarning(
      "Skipping auto-verify: sources unchanged, finding was not re-scanned",
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
      "Skipping auto-verify: finding file outside the re-scanned scope",
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

  // Positive proof, not just absence. A resolve alone cannot verify: the file
  // may have been deleted/renamed (resolves everything it contained) or the
  // code may have changed shape (e.g. reformat — the violation persists under
  // a new snippet next to the resolve). Both fail closed below. Note
  // `assessmentId` is write-once, so the sibling check below marks exactly
  // the rows created or re-detected in this run — not merely matched ones.
  const filePath = finding.location.filePath;
  const exists = scope.fileExists
    ? scope.fileExists(filePath)
    : fileExistsInCheckout(scope.rootPath, filePath);
  if (!exists) {
    reportWarning("Skipping auto-verify: finding file no longer exists", {
      code: "draft_pr_verify_scope_unproven",
      projectId: finding.projectId,
      findingId: finding.id,
      assessmentId,
      filePath,
    });
    return;
  }
  const siblingPersists = rows.findings.some(
    (candidate) =>
      candidate.id !== finding.id &&
      candidate.controlId === finding.controlId &&
      candidate.status === "open" &&
      candidate.assessmentId === assessmentId &&
      isSourceLocation(candidate.location) &&
      candidate.location.filePath === filePath,
  );
  if (siblingPersists) {
    reportWarning(
      "Skipping auto-verify: same-file violation persists after re-scan",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
        filePath,
      },
    );
    return;
  }

  // `approved` advances through `implemented` (the fix landed outside the
  // tracked PR flow — the resolve with proof above is the implementation
  // evidence); `implemented` advances straight to `verified`.
  const wasApproved = remediation.status === "approved";
  const implemented = wasApproved
    ? advanceRemediation(remediation, "implemented")
    : remediation;
  const verified = advanceRemediation(implemented, "verified");
  rows.remediations[remediationIndex] = verified;
  const detail = remediationEvidenceDetail({
    determination: "automated",
    method: "deterministic_reassessment",
    note: wasApproved
      ? "No longer detected by deterministic reassessment after approval"
      : "Verified by deterministic reassessment",
  });
  if (wasApproved) {
    appendEvidence(rows, {
      kind: "remediation_implemented",
      summary: remediationEvidenceSummary("implemented", finding),
      projectId: finding.projectId,
      controlId: finding.controlId,
      findingId: finding.id,
      assessmentId,
      detail,
    });
  }
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

  // Wall-clock ms per stage, persisted on the completion evidence (detail
  // `stageMs`) so production slowness is attributable without guessing.
  const stageMs: Record<string, number> = {};
  async function timed<T>(
    label: AssessmentJobStage,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const start = Date.now();
    // Start-of-stage marker: completion timings are reported at the end, so a
    // killed function (Vercel timeout) leaves nothing in evidence — the last
    // progress line names the stall instead. The job payload stage (best
    // effort, never failing) is what survives a crash for the UI.
    console.info(`[progress] assessment stage ${label} started`);
    try {
      options.onStage?.(label);
    } catch (error) {
      reportWarning("Assessment stage hook failed", {
        code: "assessment_stage_hook_failed",
        projectId,
        stage: label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      return await fn();
    } finally {
      stageMs[label] = Date.now() - start;
    }
  }

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
  const head = await readRepoHead(rootPath);
  const sourcesUnchanged =
    previous?.snapshot?.gitHead !== undefined &&
    head !== undefined &&
    previous.snapshot.gitHead === head &&
    previous.snapshot.controlScopeKey === snapshotKey;

  const { snapshot, changes } = await timed("changedetection", async () => {
    if (sourcesUnchanged && previous?.snapshot) {
      return {
        snapshot: { ...previous.snapshot },
        changes: [] as FileChange[],
      };
    }
    const detected = await detectChanges(rootPath, previous?.snapshot);
    return { snapshot: detected.snapshot, changes: detected.changes };
  });
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
  // Cross-file verdicts can shift with any cross-file change and deletions
  // invalidate per-file assumptions outright — both force a full-tree scan
  // with an unbounded resolve scope instead of a scoped re-scan.
  const hasCrossFileChecks = scoped.some(
    (control) =>
      control.checkId !== null && requiresFullTreeScan(control.checkId),
  );
  const forceFullScan = hasDeletion || hasCrossFileChecks;
  const useScoped =
    Boolean(previous?.snapshot) && changedJsx.length > 0 && !forceFullScan;

  // — Stage 3: AST scan (full / scoped / reuse when sources unchanged). —
  const { astFindings, filesScanned, scanMode } = await timed("ast", () => {
    if (sourcesUnchanged) {
      // Sources, scope, and engine set are identical to the last run: keep the
      // existing AST findings and skip the full-tree scan. Runtime checks still
      // run and reconcile their own findings below. `filesScanned` carries the
      // previous count (not 0): standard-authority status derivation requires
      // a real scan behind the reused findings.
      return {
        astFindings: [] as RawFinding[],
        filesScanned: previous?.filesScanned ?? 0,
        scanMode: "reused" as const,
      };
    }
    if (useScoped) {
      const scopedScan = scanChangedFiles(rootPath, changedJsx);
      return {
        astFindings: scopedScan.findings,
        filesScanned: scopedScan.filesScanned,
        scanMode: scopedScan.scanMode,
      };
    }
    const fullScan = scanProject(rootPath);
    return {
      astFindings: fullScan.findings,
      filesScanned: fullScan.filesScanned,
      scanMode: fullScan.scanMode,
    };
  });
  const scopedFileSet = sourcesUnchanged
    ? new Set<string>()
    : useScoped
      ? new Set([...changedJsx, ...deletedJsx])
      : null;

  // — Stage 4: runtime scan (only when a preview URL is configured). —
  const runtimeConfigured = hasPreviewUrl(project);
  const runtimeResult = await timed("runtime", () =>
    runtimeConfigured
      ? scanRuntime({
          runtimeBaseUrl: project.runtimeBaseUrl,
          runtimeRoutes: project.runtimeRoutes,
          browserConditions: DEFAULT_THEME_CONDITIONS,
          scanner: options.runtimeScanner,
          lookup: options.runtimeLookup,
        })
      : Promise.resolve({ findings: [], pagesScanned: 0 }),
  );
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

  // Runtime authority is scoped to the routes the audit actually rendered.
  // Without a route↔file map (`null`) the merge keeps AST findings rather than
  // assuming the whole repo was covered — a false `passed` is worse than a
  // duplicate finding.
  const runtimeCoverage = runtimeRan
    ? buildRuntimeCoverage(rootPath, runtimeResult.scannedRoutes ?? [])
    : null;

  // — Stage 5: merge AST + runtime findings (dedupe, authority). —
  // — Stage 6: reconcile per-control findings (match / create / resolve). —
  // — Stage 7: refresh requirement statuses + summarize. —
  // Timed together: all three are in-memory row work with no I/O boundary.
  const assessmentId = crypto.randomUUID();
  const summary = await timed("reconcile", () => {
    const rawFindings = mergeRawFindings(
      astFindings,
      runtimeResult.findings,
      runtimeRan,
      runtimeCoverage,
    );
    // Shared for the whole run: many new findings share a source file, so the
    // suggestion builder should read each file once (see buildSuggestion).
    const fileTextCache = new Map<string, string>();
    // Indexed once per run (O(findings + controls)): the per-control loop
    // below used to re-filter all findings twice per control plus raw hits
    // once per control — O(C×F)×3 on a hot loop that also writes evidence.
    // Rows created mid-pass are control-scoped, so upfront slices stay exact.
    const openByControl = new Map<string, Finding[]>();
    const dismissedByControl = new Map<string, Finding[]>();
    for (const finding of rows.findings) {
      if (finding.projectId !== project.id) continue;
      const target =
        finding.status === "open"
          ? openByControl
          : finding.status === "dismissed"
            ? dismissedByControl
            : null;
      if (!target) continue;
      const list = target.get(finding.controlId) ?? [];
      list.push(finding);
      target.set(finding.controlId, list);
    }
    const rawByCheckId = new Map<string, RawFinding[]>();
    for (const raw of rawFindings) {
      const list = rawByCheckId.get(raw.checkId) ?? [];
      list.push(raw);
      rawByCheckId.set(raw.checkId, list);
    }
    for (const control of scoped) {
      if (control.checkId === null) continue;
      reconcileControlFindings({
        rows,
        project,
        control,
        assessmentId,
        rootPath,
        rawForControl: rawByCheckId.get(control.checkId) ?? [],
        openFindings: openByControl.get(control.id) ?? [],
        dismissedFindings: dismissedByControl.get(control.id) ?? [],
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
                verifyRemediationOnResolve(rows, finding, assessmentId, {
                  scopedFileSet,
                  sourcesUnchanged,
                  rootPath,
                }),
      });
    }
    // Orphan reconcile: a preset/scope change can drop controls the previous
    // run assessed. Their open findings would otherwise sit open forever —
    // no in-scope control ever matches or resolves them. Resolve with
    // provenance; remediations are left untouched (no confirmed fix, so no
    // auto-verify). Preview runs build rows that are discarded on apply, so
    // this is safe to do unconditionally in-memory.
    const scopedControlIds = new Set(scoped.map((control) => control.id));
    for (const finding of rows.findings) {
      if (
        finding.projectId !== project.id ||
        finding.status !== "open" ||
        scopedControlIds.has(finding.controlId)
      ) {
        continue;
      }
      finding.status = "resolved";
      finding.resolvedNote =
        "Control removed from the assessment scope; no longer evaluated.";
      appendEvidence(rows, {
        kind: "finding",
        summary: `${finding.checkId}: control ${finding.controlId} out of scope — finding closed`,
        projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        assessmentId,
        detail: { event: "resolved", reason: "control_out_of_scope" },
      });
    }
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
    return countByStatus(scopedRequirements, REQUIREMENT_STATUSES);
  });

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
      stageMs,
      totalMs: Date.now() - Date.parse(startedAt),
      changedFiles: changes.map((change) => change.filePath),
    },
  });

  reportEvent("assessment stage timings", {
    code: "assessment_stage_timing",
    projectId,
    assessmentId,
    ...stageMs,
  });

  return {
    assessment,
    evidence: rows.evidence,
    findings: rows.findings,
    remediations: rows.remediations,
    requirements: rows.requirements,
    stageMs,
  };
}
