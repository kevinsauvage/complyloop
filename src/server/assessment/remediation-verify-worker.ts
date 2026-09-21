import "server-only";

import type { CheckAuditInput } from "@complyloop/analysis-core/check-authority";
import type { CheckId } from "@complyloop/analysis-core/check-registry";
import { SITE_VERIFY_TIMEOUT_MS } from "@complyloop/analysis-core/contract/assessment-limits";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  persistProjectRows,
  type ProjectWritePayload,
  snapshotProjectSlice,
} from "@complyloop/db/repo/apply";
import { getFindingById } from "@complyloop/db/repo/findings";
import { getProjectById } from "@complyloop/db/repo/projects";
import { listRemediationsForProject } from "@complyloop/db/repo/remediations";

import { advanceRemediation } from "@/core/requirements/remediation-lifecycle";

import { reportWarning } from "../observability";
import { withProjectLock } from "../workspace/db";
import {
  appendEvidence,
  cloneProjectRows,
  upsertFindingInRows,
} from "../workspace/project-rows";
import { sameInstance } from "./assessment-findings";
import { applyRequirementStatusRefresh } from "./assessment-status";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "./remediation-evidence";

/**
 * Worker-side runtime remediation verify.
 *
 * Runtime (`dom`/`site`) findings are proven clean-or-still-failing by a
 * Playwright re-audit. That re-audit used to run inside the finding-page
 * server action, which traced `playwright-core` + `@sparticuz/chromium`
 * (~80 MB) into the Vercel function bundle on every deploy. It now runs on
 * the GitHub Actions executor like every other runtime scan: the action only
 * enqueues a `verify_remediation` job; the worker resolves the finding
 * (no viewer session) and applies the verdict under the project write lock.
 *
 * Source findings never reach here — they verify through PR merge +
 * re-assessment (`verifyRemediationOnResolve`).
 */

/** Shown when the automated re-check still finds the violation. */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";
const PREVIEW_UNREACHABLE_MESSAGE = "Preview unreachable — check preview URL.";
const NO_PAGES_SCANNED_MESSAGE = "No pages scanned — check preview routes.";
const SITE_CHECKS_NOT_RUN_MESSAGE = "Site checks did not run.";
const SITE_VERIFY_TIMEOUT_MESSAGE =
  "Verification timed out — the preview may be slow. Try again.";

class SiteVerifyTimeoutError extends Error {
  constructor() {
    super("Site verify scan timed out.");
    this.name = "SiteVerifyTimeoutError";
  }
}

/**
 * Re-audits only the finding's own pages rather than the project's full route
 * set: the verdict only reads this finding's instance, so a full multi-route
 * scan (browser + link crawl) is unnecessary work. Finding pages are absolute
 * snapshot URLs, which the runtime joins unchanged; route-style fixtures join
 * against the base URL. Bounded by `SITE_VERIFY_TIMEOUT_MS` — on expiry the
 * shared browser keeps settling in the background while the caller fails
 * closed with a timeout verdict instead of hanging the job.
 */
async function scanSiteFindingForVerify(input: {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
  findingPages: string[];
}): Promise<Awaited<ReturnType<typeof scanRuntime>>> {
  const routes =
    input.findingPages.length > 0
      ? input.findingPages
      : (input.runtimeRoutes ?? []);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      scanRuntime({
        runtimeBaseUrl: input.runtimeBaseUrl,
        runtimeRoutes: routes,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SiteVerifyTimeoutError()),
          SITE_VERIFY_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof SiteVerifyTimeoutError) {
      return {
        findings: [],
        pagesScanned: 0,
        error: SITE_VERIFY_TIMEOUT_MESSAGE,
      };
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface VerifyVerdict {
  present: boolean;
  engine: "runtime" | "site";
  /** Positive-fix note (verified case), or undefined when still failing. */
  note: string;
  /**
   * User-facing reason shown when still failing (timeout vs preview-down vs
   * 0-pages vs engine-skipped vs still-present). Surfaced on the finding page
   * so the engineer knows whether to retry, fix the preview, or fix the code.
   */
  stillFailingMessage?: string;
  audit: CheckAuditInput;
}

async function computeVerifyVerdict(
  finding: Finding,
  project: { runtimeBaseUrl?: string; runtimeRoutes?: string[] },
): Promise<VerifyVerdict> {
  const location = finding.location;
  switch (location.kind) {
    case "source":
      // Defence in depth: the enqueue path already refuses source findings.
      throw new PublicError(
        "Source findings are verified by merging the draft pull request and re-assessing.",
      );
    case "dom": {
      const present = await runtimeViolationStillPresent({
        checkId: finding.checkId as CheckId,
        location,
      });
      return {
        present,
        engine: "runtime",
        note: "Runtime re-audit found no remaining violation on the page",
        audit: { runtimeRan: true },
      };
    }
    case "site": {
      const result = await scanSiteFindingForVerify({
        runtimeBaseUrl: project.runtimeBaseUrl,
        runtimeRoutes: project.runtimeRoutes,
        findingPages: location.pages,
      });
      const verifyTimedOut = result.error === SITE_VERIFY_TIMEOUT_MESSAGE;
      const previewUnreachable = !verifyTimedOut && Boolean(result.error);
      const present =
        verifyTimedOut ||
        previewUnreachable ||
        result.pagesScanned === 0 ||
        result.siteLevelChecksRan !== true ||
        result.findings.some((raw) => sameInstance(finding, raw));
      const stillFailingMessage = verifyTimedOut
        ? SITE_VERIFY_TIMEOUT_MESSAGE
        : previewUnreachable
          ? PREVIEW_UNREACHABLE_MESSAGE
          : result.pagesScanned === 0
            ? NO_PAGES_SCANNED_MESSAGE
            : result.siteLevelChecksRan !== true
              ? SITE_CHECKS_NOT_RUN_MESSAGE
              : STILL_FAILING_VERIFY_MESSAGE;
      return {
        present,
        engine: "site",
        note: "Runtime re-audit found no remaining site-level violation",
        stillFailingMessage,
        audit: {
          runtimeRan: true,
          siteLevelChecksRan: result.siteLevelChecksRan,
          htmlValidateRan: result.htmlValidateRan,
        },
      };
    }
    default: {
      const _exhaustive: never = location;
      throw new Error(`Unhandled finding location: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Runs a `verify_remediation` job: load → re-audit → apply, as the project's
 * system actor (no viewer session). A "still failing" verdict is a recorded
 * outcome, not a job failure — the job only fails when the re-audit itself
 * throws (retried by the queue like any other job).
 */
export async function runRemediationVerifyJob(
  findingId: string,
): Promise<void> {
  const drizzle = await getDrizzle();
  const finding = await getFindingById(drizzle, findingId);
  if (!finding) {
    throw new Error(`Remediation verify job: unknown finding ${findingId}.`);
  }
  const project = await getProjectById(drizzle, finding.projectId);
  if (!project) {
    throw new Error(
      `Remediation verify job: unknown project ${finding.projectId}.`,
    );
  }
  const verdict = await computeVerifyVerdict(finding, project);

  await withProjectLock(finding.projectId, async (tx) => {
    const live = await getFindingById(tx, findingId);
    if (!live) return;
    const remediation = await loadRemediationForFinding(tx, live);
    if (!remediation || remediation.status !== "implemented") {
      // A concurrent write already advanced it, or there is nothing to
      // verify (dismissed / removed).
      return;
    }
    // Re-validate inside the lock: the finding may have moved between the
    // read and the apply. Dismissed findings are never verifiable; resolved
    // ones are (identical proof), but never against a drifted location.
    if (
      (live.status !== "open" && live.status !== "resolved") ||
      !sameInstance(finding, live)
    ) {
      reportWarning("Skipping verify apply: finding changed during re-audit.", {
        code: "remediation_verify_finding_changed",
        findingId,
      });
      return;
    }

    // Snapshot the rows we are about to write so `persistProjectRows` applies
    // its stale-write guard (updatedAt match) instead of blind-upserting.
    const loadedSlice = snapshotProjectSlice(
      [],
      [live],
      [remediation],
      [],
      finding.projectId,
    );
    const payload: ProjectWritePayload = verdict.present
      ? stillFailingPayload(live, remediation, verdict.stillFailingMessage)
      : verifiedPayload(project, live, remediation, verdict);
    await persistProjectRows(tx, payload, { loadedSlice });
  });
}

async function loadRemediationForFinding(
  tx: Parameters<typeof listRemediationsForProject>[0],
  finding: Finding,
): Promise<Remediation | undefined> {
  const rows = await listRemediationsForProject(tx, finding.projectId);
  return rows.find((row) => row.findingId === finding.id);
}

/**
 * A resolved finding proven live again must not stay closed: re-open it so
 * the loop reflects reality, and record the failed verification as evidence
 * (history alone would not survive the evidence-derived timeline). The
 * specific reason (timeout vs preview-down vs still-present) rides on the
 * evidence `note` so the finding page can explain the failure.
 */
function stillFailingPayload(
  finding: Finding,
  remediation: Remediation,
  stillFailingMessage?: string,
): ProjectWritePayload {
  const note =
    stillFailingMessage ??
    "Verification failed: the violation is still detected on the page.";
  const findings =
    finding.status === "resolved"
      ? [{ ...finding, status: "open" as const, resolvedNote: undefined }]
      : undefined;
  const payload: ProjectWritePayload = {
    remediations: [remediation],
    ...(findings ? { findings } : {}),
  };
  appendEvidence(payload, {
    kind: "remediation_verification_failed",
    summary: `Verification failed for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: remediationEvidenceDetail({ note }),
  });
  return payload;
}

function verifiedPayload(
  project: Project,
  live: Finding,
  remediation: Remediation,
  verdict: VerifyVerdict,
): ProjectWritePayload {
  const rows = cloneProjectRows([live], [remediation], [], live.projectId);
  const verifiedRemediation = advanceRemediation(remediation, "verified");
  const alreadyResolved = live.status === "resolved";
  const updatedFinding: Finding = alreadyResolved
    ? live
    : {
        ...live,
        status: "resolved",
        resolvedNote: "Fix verified by re-running the runtime audit.",
      };
  if (!alreadyResolved) upsertFindingInRows(rows, updatedFinding);
  appendEvidence(rows, {
    kind: "remediation_verified",
    summary: remediationEvidenceSummary("verified", live),
    projectId: live.projectId,
    controlId: live.controlId,
    findingId: live.id,
    detail: remediationEvidenceDetail({
      engine: verdict.engine,
      note: verdict.note,
    }),
  });
  applyRequirementStatusRefresh(rows, project, {
    controlIds: [live.controlId],
    runtimeRan: verdict.audit.runtimeRan,
    siteLevelChecksRan: verdict.audit.siteLevelChecksRan,
    htmlValidateRan: verdict.audit.htmlValidateRan,
  });
  return {
    findings: [updatedFinding],
    requirements: rows.requirements,
    evidence: rows.evidence,
    remediations: [verifiedRemediation],
  };
}
