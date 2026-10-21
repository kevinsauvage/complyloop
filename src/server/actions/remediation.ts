"use server";

import { z } from "zod";

import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import {
  type Dismissal,
  DISMISSAL_REASONS,
} from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { DrizzleDb } from "@complyloop/db/postgres";
import {
  insertEvidence,
  insertEvidenceRecords,
} from "@complyloop/db/repo/evidence";
import {
  listFindingsByIds,
  upsertFindings,
} from "@complyloop/db/repo/findings";
import {
  getRemediationByFindingId,
  listRemediationsForFindings,
} from "@complyloop/db/repo/remediations";
import { upsertRemediations } from "@complyloop/db/repo/remediations";
import { upsertRequirements } from "@complyloop/db/repo/requirements";

import type { ActionState } from "@/core/actions/action-state";
import {
  findingIdsField,
  optionalNoteSchema,
  parseForm,
} from "@/core/actions/validate";
import {
  advanceRemediation,
  canBulkApproveRemediation,
} from "@/core/requirements/remediation-lifecycle";

import { runAction } from "../action-state";
import { refreshRequirementsForControls } from "../assessment/assessment-status";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import { assertRemediationRateLimit } from "../rate-limit";
import { stampEvidenceActor } from "../workspace/project-rows";
import {
  resolveActiveProjectId,
  withProjectTx,
} from "../workspace/workspace-write";
import { runFindingAction } from "./define-action";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

/** Upper bound on a bulk action: keeps one click to a bounded write set. */
const BULK_FINDING_LIMIT = 100;

function boundedFindingIds(emptyMessage: string) {
  return findingIdsField(emptyMessage).refine(
    (ids) => ids.length <= BULK_FINDING_LIMIT,
    { error: `Select at most ${BULK_FINDING_LIMIT} findings at a time.` },
  );
}

const bulkApproveInput = z.object({
  findingIds: boundedFindingIds("Select at least one finding to approve."),
});

const dismissFindingInput = z.object({
  reason: z.enum(DISMISSAL_REASONS, {
    error: "A dismissal reason is required.",
  }),
  note: optionalNoteSchema,
});

const bulkDismissInput = z.object({
  findingIds: boundedFindingIds("Select at least one finding to dismiss."),
  reason: z.enum(DISMISSAL_REASONS, {
    error: "A dismissal reason is required.",
  }),
  note: optionalNoteSchema,
});

interface WriteContext {
  tx: DrizzleDb;
  actor: string | undefined;
}

async function loadRemediation(
  tx: DrizzleDb,
  findingId: string,
): Promise<Remediation> {
  const remediation = await getRemediationByFindingId(tx, findingId);
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}

async function approveInTx(
  ctx: WriteContext,
  finding: Finding,
  remediation: Remediation,
  options: { bulk?: boolean; approvalNote: string },
): Promise<void> {
  // Approving a dismissed/resolved finding would put a closed finding back in
  // the remediation loop without evidence that it is still open.
  if (finding.status !== "open") {
    throw new PublicError("Only open findings can be approved.");
  }
  await upsertRemediations(ctx.tx, [
    advanceRemediation(remediation, "approved"),
  ]);
  await insertEvidence(ctx.tx, {
    kind: "remediation_approved",
    summary: remediationEvidenceSummary("approved", finding),
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: remediationEvidenceDetail({
      ...(options.bulk ? { bulk: true } : {}),
      ...(finding.fix ? { fix: { ...finding.fix } } : {}),
      note: options.approvalNote,
    }),
    actor: ctx.actor,
  });
}

async function dismissInTx(
  ctx: WriteContext,
  finding: Finding,
  reason: Dismissal["reason"],
  note: string,
  at: string,
  options: { bulk?: boolean },
): Promise<Finding> {
  if (finding.status !== "open") {
    throw new PublicError("Only open findings can be dismissed.");
  }
  const updated: Finding = {
    ...finding,
    status: "dismissed",
    dismissal: { reason, note, at },
  };
  await upsertFindings(ctx.tx, [updated]);
  await insertEvidence(ctx.tx, {
    kind: "finding",
    summary: `Finding dismissed (${reason}): ${finding.checkId} at ${formatLocationRef(finding.location)}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: options.bulk
      ? { event: "dismissed", reason, note, bulk: true }
      : { event: "dismissed", reason, note },
    actor: ctx.actor,
  });
  return updated;
}

/**
 * Re-derives the touched controls after a dismiss and writes the changed
 * requirement rows plus the resulting evidence.
 *
 * A human dismiss is not an automated pass: force a no-scan audit context so
 * standard controls resolve to unable_to_verify (not passed) and runtime/site
 * controls stay unable_to_verify without an engine run. Human attribution
 * lives on the "finding dismissed" evidence.
 */
async function refreshAfterDismiss(
  ctx: WriteContext,
  project: Parameters<typeof refreshRequirementsForControls>[1],
  controlIds: readonly string[],
): Promise<void> {
  const refreshed = await refreshRequirementsForControls(
    ctx.tx,
    project,
    controlIds,
    { runtimeRan: false, filesScanned: 0 },
  );
  await upsertRequirements(ctx.tx, refreshed.requirements);
  stampEvidenceActor(refreshed.evidence, ctx.actor);
  await insertEvidenceRecords(ctx.tx, refreshed.evidence);
}

export async function approveRemediationAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runFindingAction(
    findingIdRaw,
    "project.remediate",
    async (ctx) => {
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      const remediation = await loadRemediation(ctx.tx, ctx.finding.id);
      await approveInTx(ctx, ctx.finding, remediation, {
        approvalNote: "Approved by user",
      });
    },
    "Remediation approved.",
  );
}

/** Approves remediations that are already in `suggested` (skips others). */
export async function bulkApproveRemediationsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { findingIds } = parseForm(bulkApproveInput, formData);
    let approved = 0;

    const projectId = await resolveActiveProjectId();
    await withProjectTx(projectId, "project.remediate", async (ctx) => {
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      // One IN query for findings + one for remediations instead of two round
      // trips per id (bulk is capped at BULK_FINDING_LIMIT).
      const findingsById = new Map(
        (await listFindingsByIds(ctx.tx, findingIds)).map((finding) => [
          finding.id,
          finding,
        ]),
      );
      const remediationsByFindingId = new Map(
        (await listRemediationsForFindings(ctx.tx, findingIds)).map(
          (remediation) => [remediation.findingId, remediation],
        ),
      );
      for (const findingId of findingIds) {
        const finding = findingsById.get(findingId);
        if (!finding || finding.projectId !== projectId) {
          throw new PublicError("Unknown finding.");
        }
        if (finding.status !== "open") continue;
        const remediation = remediationsByFindingId.get(findingId);
        if (!remediation) {
          throw new PublicError("No remediation for that finding.");
        }
        if (
          !canBulkApproveRemediation(
            finding,
            remediation.status,
            remediation.suggestion,
          )
        ) {
          continue;
        }

        await approveInTx(ctx, finding, remediation, {
          bulk: true,
          approvalNote: "Approved in bulk",
        });
        approved += 1;
      }
    });

    if (approved === 0) {
      throw new PublicError(
        "No selected findings had guidance ready to approve.",
      );
    }
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return `Approved ${approved} remediation${approved === 1 ? "" : "s"}.`;
  });
}

export async function dismissFindingAction(
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
      const { reason, note } = parseForm(dismissFindingInput, formData);
      await dismissInTx(
        ctx,
        ctx.finding,
        reason,
        note ?? "",
        new Date().toISOString(),
        {},
      );
      await refreshAfterDismiss(ctx, ctx.project, [ctx.finding.controlId]);
    },
    "Finding dismissed.",
  );
}

export async function bulkDismissFindingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { findingIds, reason, note } = parseForm(bulkDismissInput, formData);
    const dismissalNote = note ?? "";
    const at = new Date().toISOString();
    let dismissed = 0;

    const projectId = await resolveActiveProjectId();
    await withProjectTx(projectId, "project.remediate", async (ctx) => {
      if (ctx.userId) {
        await assertRemediationRateLimit(ctx.userId, ctx.tx);
      }
      const controlIds = new Set<string>();
      const findingsById = new Map(
        (await listFindingsByIds(ctx.tx, findingIds)).map((finding) => [
          finding.id,
          finding,
        ]),
      );
      for (const findingId of findingIds) {
        const finding = findingsById.get(findingId);
        if (!finding || finding.projectId !== projectId) {
          throw new PublicError("Unknown finding.");
        }
        if (finding.status !== "open") continue;
        await dismissInTx(ctx, finding, reason, dismissalNote, at, {
          bulk: true,
        });
        controlIds.add(finding.controlId);
        dismissed += 1;
      }
      if (controlIds.size === 0) {
        throw new PublicError("No open findings were dismissed.");
      }
      await refreshAfterDismiss(ctx, ctx.project, [...controlIds]);
    });

    refresh(...COMPLIANCE_LOOP_ROUTES);
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
