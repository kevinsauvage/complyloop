import "server-only";

import { requiresFullTreeScan } from "@complyloop/analysis-core/check-authority";
import { checkRegistrySignature } from "@complyloop/analysis-core/checks/registry";
import {
  type Assessment,
  type AssessmentSnapshot,
  type FileChange,
} from "@complyloop/analysis-core/contract/entities";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import { mergeRawFindings } from "@complyloop/analysis-core/merge-findings";
import type { RuntimeScanResult } from "@complyloop/analysis-core/runtime/findings";
import { scanRuntime } from "@complyloop/analysis-core/runtime/scan";
import { DEFAULT_THEME_CONDITIONS } from "@complyloop/analysis-core/runtime/theme-conditions";
import { scanChangedFiles, scanProject } from "@complyloop/analysis-core/scan";
import type { RawFinding } from "@complyloop/analysis-core/types";

import { latestAssessmentFor } from "@/core/assessment/assessment-helpers";
import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";

import { reportWarning } from "../observability";
import { assertAssessableCatalog } from "../workspace/project-scope";
import type { RunAssessmentOptions } from "./assessment";
import { type AssessmentPipelineInput } from "./assessment-scratch";
import { detectChanges, readRepoHead, summarizeChanges } from "./monitor";
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
  runtimeTied: boolean,
  auditedSha: string | undefined,
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
    ...(runtimeRan && auditedSha ? { runtimeAuditedSha: auditedSha } : {}),
    runtimeTied,
    scanFeatures: scanFeatures.length > 0 ? scanFeatures : undefined,
    themeConditions: runtimeConfigured
      ? [...DEFAULT_THEME_CONDITIONS]
      : undefined,
    runtimeError: runtimeResult.error,
  };
}

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/** Route pathname of a runtime URL (query/hash dropped — preview tokens). */
function pathnameOfUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    return pathname === "" ? "/" : pathname;
  } catch {
    return null;
  }
}

/**
 * Raw artifact of the scan phase: the checkout is read and analyzed, but no
 * project row is touched and nothing is persisted. The worker scans once (in
 * the ephemeral checkout), then hands this to `reconcileAssessment` — which
 * runs on freshly loaded rows inside the apply transaction, so a scan that
 * takes minutes cannot reconcile against a stale snapshot.
 */
export interface AssessmentScanResult {
  assessmentId: string;
  startedAt: string;
  snapshot: AssessmentSnapshot;
  changes: FileChange[];
  changeContext: string | undefined;
  /** Git head of the previous snapshot (for the change evidence detail). */
  previousGitHead: string | undefined;
  /** True when sources were reused without any scan (same commit + scope). */
  sourcesUnchanged: boolean;
  /** Files this run re-scanned (`null` = full-tree scan). */
  scopedFileSet: Set<string> | null;
  rawFindings: RawFinding[];
  filesScanned: number;
  scanMode: NonNullable<Assessment["scanMode"]>;
  engines: AssessmentEngines;
  runtime: {
    configured: boolean;
    ran: boolean;
    /**
     * The audit ran against a deployment serving the scanned commit. Only a
     * tied run may supersede AST findings, resolve runtime findings or pass
     * runtime-only requirements; an untied run just reports what it saw.
     */
    tied: boolean;
    /**
     * Every configured route rendered. A partial run (one page timed out, axe
     * crashed on one page) may still report findings from the pages it did
     * render, but it cannot pass runtime-only requirements or site-level
     * checks — never let an unrendered page read as clean.
     */
    complete: boolean;
    /** Origin that was audited (set whenever runtime ran), for untied resolution. */
    auditedOrigin?: string;
    pagesScanned: number;
    /** Route pathnames that rendered cleanly this run. */
    scannedRoutes: readonly string[];
    /** Route pathnames that failed this run — never resolved by this run. */
    failedRoutes: readonly string[];
    siteLevelChecksRan?: boolean;
    htmlValidateRan?: boolean;
    applicabilityFacts?: ReadonlyMap<string, string>;
    error?: string;
  };
  /** Wall-clock ms per scan stage; reconcile appends its own entry. */
  stageMs: Record<string, number>;
}

/**
 * Wall-clock stage timer: emits a start marker (so a killed function names the
 * stall in logs) and records the stage duration. The job-payload stage hook is
 * best-effort — a progress failure must never fail the assessment.
 */
export function createStageTimer(
  stageMs: Record<string, number>,
  onStage: RunAssessmentOptions["onStage"],
  projectId: string,
): <T>(label: AssessmentJobStage, fn: () => Promise<T> | T) => Promise<T> {
  return async (label, fn) => {
    const start = Date.now();
    // Start-of-stage marker: completion timings are reported at the end, so a
    // killed function (Vercel timeout) leaves nothing in evidence — the last
    // progress line names the stall instead. The job payload stage (best
    // effort, never failing) is what survives a crash for the UI.
    console.info(`[progress] assessment stage ${label} started`);
    try {
      onStage?.(label);
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
  };
}

/**
 * Scan phase: read the checkout and produce raw findings + the assessment
 * snapshot, reusing prior findings when the commit, scope, and engine set are
 * unchanged. Pure with respect to project rows — it reads `input` (project +
 * prior assessment snapshot) but never mutates it, and never writes evidence.
 */
export async function scanAssessment(
  input: AssessmentPipelineInput,
  options: RunAssessmentOptions,
): Promise<AssessmentScanResult> {
  const { project } = input;
  const projectId = project.id;
  const { rootPath } = options;

  const startedAt = new Date().toISOString();

  // Wall-clock ms per stage, persisted on the completion evidence (detail
  // `stageMs`) so production slowness is attributable without guessing.
  const stageMs: Record<string, number> = {};
  const timed = createStageTimer(stageMs, options.onStage, projectId);

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
  // An explicit target (a deployment_status job) always wins. Otherwise reuse
  // the project's newest known deployment when it serves exactly the commit
  // checked out — a manual re-run of an unchanged commit stays tied instead
  // of falling back to a URL that may serve an older build.
  const known = project.lastDeployment;
  const runtimeTarget =
    options.runtimeTarget ??
    (known &&
    head !== undefined &&
    known.sha.toLowerCase() === head.toLowerCase()
      ? known
      : undefined);
  const runtimeBaseUrl = runtimeTarget?.url ?? project.runtimeBaseUrl;
  const runtimeConfigured = Boolean(runtimeBaseUrl?.trim());
  const runtimeResult = await timed("runtime", () =>
    runtimeConfigured
      ? scanRuntime({
          runtimeBaseUrl,
          runtimeRoutes: project.runtimeRoutes,
          browserConditions: DEFAULT_THEME_CONDITIONS,
          scanner: options.runtimeScanner,
          lookup: options.runtimeLookup,
        })
      : Promise.resolve<RuntimeScanResult>({
          findings: [],
          pagesScanned: 0,
        }),
  );
  const runtimePageFailures = runtimeResult.pageFailures ?? [];
  const runtimeRan =
    runtimeConfigured &&
    runtimeResult.error === undefined &&
    runtimeResult.pagesScanned > 0;
  // Rendered everything it was asked to render. A partial run still reports
  // the pages it saw, but it is not authority over the pages that failed.
  const runtimeComplete = runtimeRan && runtimePageFailures.length === 0;
  if (runtimeConfigured && !runtimeRan) {
    // A failed runtime sub-scan does not fail the job, so without this the
    // classified cause only lands in evidence — invisible in Vercel logs and
    // Sentry. Origin only, never the full URL (preview tokens).
    let previewOrigin: string | undefined;
    try {
      previewOrigin = new URL(runtimeBaseUrl as string).origin;
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
  if (runtimeRan && runtimePageFailures.length > 0) {
    // Partial coverage is a degraded authority, not a failure: surface the
    // count so a "why is this requirement unable_to_verify" question has an
    // answer in logs and Sentry.
    reportWarning("runtime scan covered only some routes", {
      code: "assessment_runtime_partial",
      projectId,
      pagesScanned: runtimeResult.pagesScanned,
      failedPages: runtimePageFailures.length,
    });
  }

  // Tied = the audited deployment serves exactly the commit this scan read.
  // A static URL (no target) or a mismatched SHA is untied: a regression that
  // is not deployed yet must not disappear behind the previous deploy's DOM.
  const runtimeTied =
    runtimeRan &&
    runtimeTarget !== undefined &&
    head !== undefined &&
    runtimeTarget.sha.toLowerCase() === head.toLowerCase();

  const engines = buildAssessmentEngines(
    runtimeConfigured,
    runtimeRan,
    runtimeResult,
    runtimeTied,
    runtimeTarget?.sha,
  );

  // Runtime authority is scoped to the routes the audit actually rendered.
  // Without a route↔file map (`null`) the merge keeps AST findings rather than
  // assuming the whole repo was covered — a false `passed` is worse than a
  // duplicate finding. A partial run (some route failed) is treated the same
  // way: it cannot vouch for the pages it never rendered.
  const runtimeCoverage =
    runtimeTied && runtimeComplete
      ? buildRuntimeCoverage(rootPath, runtimeResult.scannedRoutes ?? [])
      : null;

  // — Stage 5: merge AST + runtime findings (dedupe, authority). —
  const assessmentId = crypto.randomUUID();

  return {
    assessmentId,
    startedAt,
    snapshot,
    changes,
    changeContext,
    previousGitHead: previous?.snapshot?.gitHead,
    sourcesUnchanged,
    scopedFileSet,
    rawFindings: mergeRawFindings(
      astFindings,
      runtimeResult.findings,
      runtimeTied,
      runtimeCoverage,
    ),
    filesScanned,
    scanMode,
    engines,
    runtime: {
      configured: runtimeConfigured,
      ran: runtimeRan,
      tied: runtimeTied,
      complete: runtimeComplete,
      auditedOrigin: runtimeRan ? originOf(runtimeBaseUrl) : undefined,
      pagesScanned: runtimeResult.pagesScanned,
      scannedRoutes: runtimeResult.scannedRoutes ?? [],
      failedRoutes: runtimePageFailures
        .map((failure) => pathnameOfUrl(failure.url))
        .filter((route): route is string => route !== null),
      siteLevelChecksRan: runtimeResult.siteLevelChecksRan,
      htmlValidateRan: runtimeResult.htmlValidateRan,
      applicabilityFacts: runtimeResult.applicabilityFacts,
      error: runtimeResult.error,
    },
    stageMs,
  };
}
