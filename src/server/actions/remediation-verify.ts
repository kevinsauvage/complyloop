"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import { getFindingById } from "@complyloop/db/repo/findings";
import {
  getRemediationByFindingId,
  upsertRemediations,
} from "@complyloop/db/repo/remediations";

import type { ActionState } from "@/core/actions/action-state";
import {
  optionalNoteSchema,
  parseEntityId,
  parseForm,
  requiredField,
} from "@/core/actions/validate";
import { advanceRemediation } from "@/core/requirements/remediation-lifecycle";

import { runAction } from "../action-state";
import { sameInstance } from "../assessment/assessment-findings";
import {
  enqueueAssessmentJob,
  recoverExpiredAssessmentLeases,
} from "../assessment/assessment-jobs";
import {
  scheduleAssessmentDrain,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-scheduler";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import { assertRemediationRateLimit } from "../rate-limit";
import { requireFinding } from "../workspace/workspace";
import { withProjectTx } from "../workspace/workspace-write";
import { runFindingAction } from "./define-action";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

const markImplementedInput = z.object({
  note: optionalNoteSchema,
});

const SOURCE_VERIFY_MESSAGE =
  "Source findings are verified by merging the draft pull request and re-assessing.";

const VERIFY_REQUIRES_IMPLEMENTED_MESSAGE =
  "Verification requires status implemented.";

const IMPLEMENT_REQUIRES_APPROVED_MESSAGE =
  "Marking implemented requires status approved.";

const FINDING_NOT_VERIFIABLE_MESSAGE = "Finding is no longer open.";

/**
 * A finding is only verifiable from `open`/`resolved` — a dismissed finding
 * must never be re-audited into `verified` (the dismissal was a deliberate
 * decision, not a fix). Fails closed on any other status.
 */
function assertVerifiableFinding(finding: { status: string }): void {
  if (finding.status !== "open" && finding.status !== "resolved") {
    throw new PublicError(FINDING_NOT_VERIFIABLE_MESSAGE);
  }
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
    // Lock-free read only to resolve the finding's project. Every guard below
    // re-runs inside the transaction, under the project lock.
    const preview = await requireFinding(findingId);

    // The runtime re-audit itself runs on the worker (a `verify_remediation`
    // job) — never in this request, which keeps Playwright/chromium out of the
    // Vercel function bundle.
    await withProjectTx(preview.projectId, "project.remediate", async (ctx) => {
      const live = await getFindingById(ctx.tx, findingId);
      if (!live) throw new PublicError("Unknown finding.");
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      const remediation = await getRemediationByFindingId(ctx.tx, findingId);
      if (!remediation) {
        throw new PublicError("No remediation for that finding.");
      }
      if (remediation.status !== "implemented") {
        throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
      }
      if (live.location.kind === "source") {
        throw new PublicError(SOURCE_VERIFY_MESSAGE);
      }
      // Re-validate under the lock: a concurrent write may have dismissed
      // the finding since the preview read.
      assertVerifiableFinding(live);

      await recoverExpiredAssessmentLeases(ctx.tx);
      const job = await enqueueAssessmentJob(
        {
          projectId: live.projectId,
          trigger: "verify_remediation",
          requestedByUserId: ctx.userId,
          payload: { findingId },
        },
        ctx.tx,
      );
      await insertEvidence(ctx.tx, {
        kind: "assessment_job",
        summary: `Remediation verify job ${job.id} queued for "${ctx.project.name}"`,
        projectId: live.projectId,
        controlId: live.controlId,
        findingId: live.id,
        detail: {
          phase: "queued",
          jobId: job.id,
          trigger: "verify_remediation",
        },
        actor: ctx.actor,
      });
    });

    if (shouldDrainAssessmentJobsInline()) {
      const message = await scheduleAssessmentDrain();
      refresh(...COMPLIANCE_LOOP_ROUTES);
      return message ?? "Fix verified by automated re-check.";
    }
    const { after } = await import("next/server");
    after(() => scheduleAssessmentDrain());
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Verification queued — the worker re-audits shortly. Track it on this finding.";
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
    async (ctx) => {
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      const { note: parsedNote } = parseForm(markImplementedInput, formData);
      const remediation = await getRemediationByFindingId(
        ctx.tx,
        ctx.finding.id,
      );
      if (!remediation) {
        throw new PublicError("No remediation for that finding.");
      }
      if (remediation.status !== "approved") {
        throw new PublicError(IMPLEMENT_REQUIRES_APPROVED_MESSAGE);
      }
      const note =
        parsedNote ??
        "Marked implemented by user (applied outside the platform)";

      await upsertRemediations(ctx.tx, [
        advanceRemediation(remediation, "implemented"),
      ]);
      await insertEvidence(ctx.tx, {
        kind: "remediation_implemented",
        summary: remediationEvidenceSummary("implemented", ctx.finding),
        projectId: ctx.finding.projectId,
        controlId: ctx.finding.controlId,
        findingId: ctx.finding.id,
        detail: remediationEvidenceDetail({ manual: true, note }),
        actor: ctx.actor,
      });
    },
    "Marked as implemented.",
  );
}

const attestVerifiedInput = z.object({
  note: requiredField("Add a note describing how the fix was confirmed.", 2000),
});

const ATTEST_REQUIRES_RESOLVED_MESSAGE =
  "Manual confirmation is only available for resolved findings — verify open findings with the automated re-check.";

/**
 * Manually confirms a fix the automated paths cannot prove: the finding
 * already resolved (re-assessment no longer flags it) with the remediation
 * implemented, but no re-audit or re-scan verified it — the DOM case that
 * used to freeze at `implemented` forever. Writes
 * `remediation_manually_verified` (previously never written) with the
 * engineer's note as the provenance. Source findings are excluded: they
 * verify through PR merge + re-assessment.
 */
export async function attestRemediationVerifiedAction(
  findingIdRaw: string,
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previous;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const { note } = parseForm(attestVerifiedInput, formData);
    const preview = await requireFinding(findingId);
    if (preview.location.kind === "source") {
      throw new PublicError(SOURCE_VERIFY_MESSAGE);
    }
    if (preview.status !== "resolved") {
      throw new PublicError(ATTEST_REQUIRES_RESOLVED_MESSAGE);
    }

    await withProjectTx(preview.projectId, "project.remediate", async (ctx) => {
      const live = await getFindingById(ctx.tx, findingId);
      if (!live) throw new PublicError("Unknown finding.");
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      if (live.status !== "resolved") {
        throw new PublicError(ATTEST_REQUIRES_RESOLVED_MESSAGE);
      }
      if (!sameInstance(preview, live)) {
        throw new PublicError("Finding changed since load. Re-assess.");
      }
      const remediation = await getRemediationByFindingId(ctx.tx, findingId);
      if (!remediation) {
        throw new PublicError("No remediation for that finding.");
      }
      if (remediation.status !== "implemented") {
        throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
      }

      await upsertRemediations(ctx.tx, [
        advanceRemediation(remediation, "verified"),
      ]);
      await insertEvidence(ctx.tx, {
        kind: "remediation_manually_verified",
        summary: remediationEvidenceSummary("verified", live),
        projectId: live.projectId,
        controlId: live.controlId,
        findingId: live.id,
        detail: remediationEvidenceDetail({ manual: true, note }),
        actor: ctx.actor,
      });
    });
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Fix marked verified with manual confirmation.";
  });
}
