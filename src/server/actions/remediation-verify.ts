"use server";

import { z } from "zod";

import type { CheckAuditInput } from "@complyloop/analysis-core/check-authority";
import type { CheckId } from "@complyloop/analysis-core/check-registry";
import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { WorkspaceSlice } from "@complyloop/db/types";

import {
  advanceRemediation,
  appendRemediationHistory,
} from "@/core/remediation-lifecycle";
import { optionalNoteSchema, parseEntityId, parseForm } from "@/core/validate";

import type { ActionState } from "../action-state";
import { runAction } from "../action-state";
import { sameInstance } from "../assessment/assessment-findings";
import { applyRequirementStatusRefresh } from "../assessment/assessment-status";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import {
  appendEvidence,
  cloneProjectRows,
  upsertFindingInRows,
} from "../workspace/project-rows";
import {
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace/workspace";
import { withFindingWrite } from "../workspace/workspace-write";
import { runFindingAction } from "./define-action";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, replaceRemediation, requireFindingContext } from "./shared";

const markImplementedInput = z.object({
  note: optionalNoteSchema,
});

const SOURCE_VERIFY_MESSAGE =
  "Source findings are verified by merging the draft pull request and re-assessing.";

/** Shown when automated re-check still finds the violation (role=alert). */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";

/** Distinct site-verify failure reasons (preview-down vs 0-pages vs engine-skipped). */
const PREVIEW_UNREACHABLE_MESSAGE = "Preview unreachable — check preview URL.";
const NO_PAGES_SCANNED_MESSAGE = "No pages scanned — check preview routes.";
const SITE_CHECKS_NOT_RUN_MESSAGE = "Site checks did not run.";

const VERIFY_REQUIRES_IMPLEMENTED_MESSAGE =
  "Verification requires status implemented.";

const IMPLEMENT_REQUIRES_APPROVED_MESSAGE =
  "Marking implemented requires status approved.";

/** Wall-clock budget for an interactive site re-audit (see below). */
export const SITE_VERIFY_TIMEOUT_MS = 120_000;

const SITE_VERIFY_TIMEOUT_MESSAGE =
  "Verification timed out — the preview may be slow. Try again.";

class SiteVerifyTimeoutError extends Error {
  constructor() {
    super("Site verify scan timed out.");
    this.name = "SiteVerifyTimeoutError";
  }
}

/**
 * Re-audits only the finding's own pages instead of the project's full route
 * set: the verdict below only reads this finding's instance, and a full
 * multi-route scan (browser + link crawl) inside an interactive request races
 * the function ceiling. Finding pages are absolute snapshot URLs, which the
 * runtime joins unchanged; route-style fixtures join against the base URL.
 * Bounded by `SITE_VERIFY_TIMEOUT_MS` — on expiry the shared browser keeps
 * settling in the background while the caller fails closed with a timeout
 * message instead of hanging the request.
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

function recordStillFailing(
  payload: ProjectWritePayload,
  remediation: Remediation,
): void {
  replaceRemediation(
    payload,
    appendRemediationHistory(
      remediation,
      remediation.status,
      "Verification failed: the violation is still detected on the page.",
    ),
  );
}

function markVerified(
  db: WorkspaceSlice,
  live: Finding,
  remediation: Remediation,
  note: string,
  engine: "runtime" | "site",
  audit: CheckAuditInput,
  preview?: Finding,
): ProjectWritePayload {
  const project = db.projects.find(
    (candidate) => candidate.id === live.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");

  // Re-check inside the write lock: a concurrent write may have advanced the
  // remediation between the preview load and this transaction. Never resolve
  // a finding that is no longer open, and never verify against a location
  // that drifted since the preview scan.
  if (live.status !== "open") {
    throw new PublicError("Finding is no longer open.");
  }
  if (preview && !sameInstance(preview, live)) {
    throw new PublicError("Finding changed since scan. Re-assess.");
  }
  if (remediation.status !== "implemented") {
    throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
  }

  const rows = cloneProjectRows(
    db.findings,
    db.remediations,
    db.requirements,
    project.id,
  );
  const verifiedRemediation = advanceRemediation(remediation, "verified", note);
  const updatedFinding: Finding = {
    ...live,
    status: "resolved",
    resolvedNote: "Fix verified by re-running the runtime audit.",
  };
  upsertFindingInRows(rows, updatedFinding);
  appendEvidence(rows, {
    kind: "remediation_verified",
    summary: remediationEvidenceSummary("verified", live),
    projectId: live.projectId,
    controlId: live.controlId,
    findingId: live.id,
    detail: remediationEvidenceDetail({ engine }),
  });
  applyRequirementStatusRefresh(rows, project, {
    controlIds: [live.controlId],
    runtimeRan: audit.runtimeRan,
    siteLevelChecksRan: audit.siteLevelChecksRan,
    htmlValidateRan: audit.htmlValidateRan,
  });
  const payload: ProjectWritePayload = {
    findings: [updatedFinding],
    requirements: rows.requirements,
    evidence: rows.evidence,
  };
  replaceRemediation(payload, verifiedRemediation);
  return payload;
}

export async function verifyRemediationAction(
  findingIdRaw: string,
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previous;
  void formData;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    const { project: previewProject } = requireFindingContext(
      preview,
      finding,
      "project.remediate",
    );
    const previewRemediation = await requireRemediationForFinding(findingId);
    if (previewRemediation.status !== "implemented") {
      throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
    }

    const location = finding.location;
    let present: boolean;
    let engine: "runtime" | "site";
    let note: string;
    let audit: CheckAuditInput;
    let stillFailingMessage = STILL_FAILING_VERIFY_MESSAGE;

    switch (location.kind) {
      case "source":
        // No on-demand source re-check here on purpose. Source
        // findings are verified by merging the draft pull request and
        // re-assessing (see verifyRemediationOnResolve in assessment.ts).
        throw new PublicError(SOURCE_VERIFY_MESSAGE);
      case "dom": {
        present = await runtimeViolationStillPresent({
          checkId: finding.checkId as CheckId,
          location,
        });
        engine = "runtime";
        note = "Runtime re-audit found no remaining violation on the page";
        audit = { runtimeRan: true };
        break;
      }
      case "site": {
        const project = previewProject;
        const result = await scanSiteFindingForVerify({
          runtimeBaseUrl: project.runtimeBaseUrl,
          runtimeRoutes: project.runtimeRoutes,
          findingPages: location.pages,
        });
        const verifyTimedOut = result.error === SITE_VERIFY_TIMEOUT_MESSAGE;
        const previewUnreachable = !verifyTimedOut && Boolean(result.error);
        present =
          verifyTimedOut ||
          previewUnreachable ||
          result.pagesScanned === 0 ||
          result.siteLevelChecksRan !== true ||
          result.findings.some((raw) => sameInstance(finding, raw));
        engine = "site";
        note = "Runtime re-audit found no remaining site-level violation";
        audit = {
          runtimeRan: true,
          siteLevelChecksRan: result.siteLevelChecksRan,
          htmlValidateRan: result.htmlValidateRan,
        };
        // Distinguish timeout vs preview-down vs 0-pages vs engine-skipped so
        // the engineer knows whether to retry, fix the preview URL/routes, or
        // fix the code.
        if (verifyTimedOut) {
          stillFailingMessage = SITE_VERIFY_TIMEOUT_MESSAGE;
        } else if (previewUnreachable) {
          stillFailingMessage = PREVIEW_UNREACHABLE_MESSAGE;
        } else if (result.pagesScanned === 0) {
          stillFailingMessage = NO_PAGES_SCANNED_MESSAGE;
        } else if (result.siteLevelChecksRan !== true) {
          stillFailingMessage = SITE_CHECKS_NOT_RUN_MESSAGE;
        } else {
          stillFailingMessage = STILL_FAILING_VERIFY_MESSAGE;
        }
        break;
      }
      default: {
        const _exhaustive: never = location;
        throw new Error(`Unhandled finding location: ${String(_exhaustive)}`);
      }
    }

    let stillFailing = false;
    const previewFinding = finding;
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding: live }) => {
        // The "still present?" proof was computed outside the lock from
        // preview data. Re-validate the live row before trusting it: the
        // finding must still be open and at the same instance that was
        // scanned, otherwise the stale verdict must not decide the write.
        if (live.status !== "open") {
          throw new PublicError("Finding is no longer open.");
        }
        if (!sameInstance(previewFinding, live)) {
          throw new PublicError("Finding changed since scan. Re-assess.");
        }
        const remediation = remediationForFinding(db, findingId);
        const payload: ProjectWritePayload = {};
        if (present) {
          stillFailing = true;
          recordStillFailing(payload, remediation);
          return payload;
        }
        return markVerified(
          db,
          live,
          remediation,
          note,
          engine,
          audit,
          previewFinding,
        );
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return stillFailing
      ? stillFailingMessage
      : "Fix verified by automated re-check.";
  });
}

/**
 * Marks an approved remediation as implemented when the engineer applied the
 * change outside ComplyLoop (or there is no automatable fix).
 */
export async function markRemediationImplementedAction(
  findingIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFindingAction(
    findingIdRaw,
    "project.remediate",
    async ({ db, finding }) => {
      const { note: parsedNote } = parseForm(markImplementedInput, formData);
      const remediation = remediationForFinding(db, finding.id);
      if (remediation.status !== "approved") {
        throw new PublicError(IMPLEMENT_REQUIRES_APPROVED_MESSAGE);
      }
      const note =
        parsedNote ??
        "Marked implemented by user (applied outside the platform)";
      const payload: ProjectWritePayload = {};

      replaceRemediation(
        payload,
        advanceRemediation(remediation, "implemented", note),
      );
      appendEvidence(payload, {
        kind: "remediation_implemented",
        summary: remediationEvidenceSummary("implemented", finding),
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: remediationEvidenceDetail({ manual: true, note }),
      });
      return payload;
    },
    "Marked as implemented.",
  );
}
