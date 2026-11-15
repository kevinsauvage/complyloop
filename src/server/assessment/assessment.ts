import "server-only";

import {
  isCompositionSensitiveCheck,
  isPackageTwinSourceCheck,
  isRegisteredCheck,
  isRuntimeOnlyCheck,
} from "@complyloop/analysis-core/check-authority";
import {
  type Assessment,
  type EvidenceRecord,
  type Finding,
  type Remediation,
  type Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { type RuntimePageScanner } from "@complyloop/analysis-core/runtime/scan";
import type { DnsLookup } from "@complyloop/analysis-core/runtime/url-safety";
import type { RawFinding } from "@complyloop/analysis-core/types";

import { countByStatus } from "@/core/assessment/assessment-helpers";
import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";

import { reportEvent } from "../observability";
import { appendEvidence } from "../workspace/project-rows";
import {
  assertAssessableCatalog,
  requirementsInScope,
} from "../workspace/project-scope";
import { verifyRemediationOnResolve } from "./assessment-auto-verify";
import { reconcileControlFindings } from "./assessment-findings";
import {
  type AssessmentScanResult,
  createStageTimer,
  scanAssessment,
} from "./assessment-scan";
import {
  type AssessmentPipelineInput,
  createAssessmentScratch,
} from "./assessment-scratch";
import { applyRequirementStatusRefresh } from "./assessment-status";
import { summarizeChanges } from "./monitor";

export interface RunAssessmentOptions {
  /** Absolute path of the current ephemeral (or test) checkout to scan. */
  rootPath: string;
  /** Injected Playwright/axe scanner for tests. */
  runtimeScanner?: RuntimePageScanner;
  /** Injected DNS lookup for runtime SSRF checks in tests. */
  runtimeLookup?: DnsLookup;
  /**
   * Deployment to audit, with the commit it serves (`deployment_status` jobs).
   * Absent → the project's static `runtimeBaseUrl`, which is not tied to any
   * commit.
   */
  runtimeTarget?: { url: string; sha: string };
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

/**
 * Reconcile phase: fold a scan into project rows — match / create / resolve
 * findings, refresh requirement statuses, and build the assessment record plus
 * its evidence. Mutates an assessment-owned scratch cloned from `input`, which
 * the caller must have loaded under the project write lock; the returned rows
 * are what `applyAssessmentPayload` persists, so state and evidence always
 * agree.
 */
export async function reconcileAssessment(
  input: AssessmentPipelineInput,
  scan: AssessmentScanResult,
  options: RunAssessmentOptions,
): Promise<AssessmentRunResult> {
  const { project } = input;
  const projectId = project.id;
  const { rootPath } = options;
  const {
    assessmentId,
    startedAt,
    snapshot,
    changes,
    changeContext,
    previousGitHead,
    sourcesUnchanged,
    scopedFileSet,
    rawFindings,
    filesScanned,
    scanMode,
    engines,
    runtime,
    stageMs,
  } = scan;

  // — Reconcile stage 1: scratch rows (clone + clear expired exceptions). —
  const rows = createAssessmentScratch(input);
  const timed = createStageTimer(stageMs, options.onStage, projectId);
  const scoped = assertAssessableCatalog(project, options.controls);
  // Authority requires both a tied deployment and full route coverage: a
  // partial audit must not pass runtime-only requirements or confirm
  // applicability for pages it never rendered.
  const runtimeAuthoritative = runtime.tied && runtime.complete;

  if (changes.length > 0) {
    appendEvidence(rows, {
      kind: "monitoring_changes_detected",
      summary: changeContext ?? summarizeChanges(changes),
      projectId,
      detail: {
        files: changes.map((change) => change.filePath),
        previousGitHead,
        gitHead: snapshot.gitHead,
      },
    });
  }

  // — Stage 6: reconcile per-control findings (match / create / resolve). —
  // — Stage 7: refresh requirement statuses + summarize. —
  // Timed together: all three are in-memory row work with no I/O boundary.
  const summary = await timed("reconcile", () => {
    // Shared for the whole run: many new findings share a source file, so the
    // suggestion builder should read each file once (see buildSuggestion).
    const fileTextCache = new Map<string, string>();
    // Indexed once per run (O(findings + controls)): the per-control loop
    // below used to re-filter all findings twice per control plus raw hits
    // once per control — O(C×F)×3 on a hot loop that also writes evidence.
    // Rows created mid-pass are control-scoped, so upfront slices stay exact.
    const openByControl = new Map<string, Finding[]>();
    const dismissedByControl = new Map<string, Finding[]>();
    const resolvedByControl = new Map<string, Finding[]>();
    for (const finding of rows.findings) {
      if (finding.projectId !== project.id) continue;
      const target =
        finding.status === "open"
          ? openByControl
          : finding.status === "dismissed"
            ? dismissedByControl
            : resolvedByControl;
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
      const checkId = control.checkId;
      if (checkId === null) continue;
      reconcileControlFindings({
        rows,
        project,
        control,
        assessmentId,
        rootPath,
        rawForControl: rawByCheckId.get(checkId) ?? [],
        openFindings: openByControl.get(control.id) ?? [],
        dismissedFindings: dismissedByControl.get(control.id) ?? [],
        resolvedFindings: resolvedByControl.get(control.id) ?? [],
        scopedFileSet,
        runtimeRan: runtimeAuthoritative,
        runtimeScannedRoutes: new Set(runtime.scannedRoutes),
        runtimeFailedRoutes: new Set(runtime.failedRoutes),
        untiedRuntimeOrigin: runtime.tied ? undefined : runtime.auditedOrigin,
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
                  // Merge authority: when a runtime audit ran, AST findings for
                  // these ids are dropped without any proof of a fix.
                  runtimeOwnsCheck:
                    runtime.tied &&
                    (isCompositionSensitiveCheck(checkId) ||
                      isRuntimeOnlyCheck(checkId) ||
                      isPackageTwinSourceCheck(checkId)),
                }),
      });
    }
    // Orphan reconcile: a preset/scope change can drop controls the previous
    // run assessed, and a check can be retired from the engine entirely. In
    // both cases the per-control loop (which skips manual controls) can never
    // resolve their open findings, so they would sit open forever. Resolve
    // with provenance; remediations are left untouched (no confirmed fix, so
    // no auto-verify). Preview runs build rows discarded on apply, so this is
    // safe to do unconditionally in-memory.
    const scopedControlIds = new Set(scoped.map((control) => control.id));
    for (const finding of rows.findings) {
      if (finding.projectId !== project.id || finding.status !== "open") {
        continue;
      }
      const controlScoped = scopedControlIds.has(finding.controlId);
      const checkRegistered = isRegisteredCheck(finding.checkId);
      if (controlScoped && checkRegistered) continue;
      const retired = !checkRegistered;
      finding.status = "resolved";
      finding.resolvedNote = retired
        ? "Check retired from the assessment engine; no longer evaluated."
        : "Control removed from the assessment scope; no longer evaluated.";
      appendEvidence(rows, {
        kind: "finding",
        summary: retired
          ? `${finding.checkId}: check retired — finding closed`
          : `${finding.checkId}: control ${finding.controlId} out of scope — finding closed`,
        projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        assessmentId,
        detail: {
          event: "resolved",
          reason: retired ? "check_retired" : "control_out_of_scope",
        },
      });
    }
    applyRequirementStatusRefresh(rows, project, {
      assessmentId,
      changeContext,
      // Untied runtime results are advisory: they must not pass runtime-only
      // requirements or confirm applicability for a commit they never saw.
      runtimeRan: runtimeAuthoritative,
      siteLevelChecksRan: runtimeAuthoritative
        ? runtime.siteLevelChecksRan
        : undefined,
      htmlValidateRan: runtimeAuthoritative
        ? runtime.htmlValidateRan
        : undefined,
      applicabilityFacts: runtimeAuthoritative
        ? runtime.applicabilityFacts
        : undefined,
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

  const engineSummary = runtime.configured
    ? runtime.ran
      ? `; runtime ${runtime.pagesScanned} page(s)${runtime.tied ? "" : " (not tied to the scanned commit — advisory)"}`
      : `; runtime skipped (${runtime.error ?? "no pages"})`
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

/**
 * Full run = scan then reconcile. Kept as the single entry point for callers
 * that already hold the rows (tests, offline verification). The worker scans
 * once and lets `applyAuthoritativeAssessment` reconcile on rows it loads
 * fresh under the write lock, so a slow scan can never reconcile a stale slice.
 */
export async function runAssessment(
  input: AssessmentPipelineInput,
  options: RunAssessmentOptions,
): Promise<AssessmentRunResult> {
  const scan = await scanAssessment(input, options);
  return reconcileAssessment(input, scan, options);
}
