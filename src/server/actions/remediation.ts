"use server";

import { canBulkApproveRemediation } from "@/core/finding-act";
import { PublicError, type Finding, type Remediation } from "@complyloop/db/types"
import { type Dismissal } from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { advanceRemediation } from "@/core/remediation";
import {
  entityIdSchema,
  findingIdsField,
  optionalNoteSchema,
} from "@/core/boundary";
import { z } from "zod";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseInput } from "../boundary";
import { refreshRequirementStatusesForControls } from "../assessment-status";
import type { Db } from "../db";
import type { ProjectWriteCollector } from "../workspace";
import {
  findingById,
  remediationForFinding,
  withProjectWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

const DISMISSAL_REASONS = [
  "false_positive",
  "not_applicable",
  "accepted_risk",
] as const;

const bulkApproveInput = z.object({
  findingIds: findingIdsField("Select at least one finding to approve."),
});

const dismissFindingInput = z.object({
  reason: z.enum(DISMISSAL_REASONS, {
    error: "A dismissal reason is required.",
  }),
  note: optionalNoteSchema,
});

const bulkDismissInput = z.object({
  findingIds: findingIdsField("Select at least one finding to dismiss."),
  reason: z.enum(DISMISSAL_REASONS, {
    error: "A dismissal reason is required.",
  }),
  note: optionalNoteSchema,
});

function approveRemediationInDb(
  db: Db,
  writes: ProjectWriteCollector,
  finding: Finding,
  remediation: Remediation,
  options: { bulk?: boolean; approvalNote: string },
): void {
  replaceRemediation(
    db,
    advanceRemediation(remediation, "approved", options.approvalNote),
    writes,
  );
  writes.addEvidence({
    kind: "remediation_approved",
    summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: options.bulk
      ? {
        bulk: true,
        ...(finding.fix ? { fix: { ...finding.fix } } : {}),
      }
      : finding.fix
        ? { fix: { ...finding.fix } }
        : undefined,
  });
}

function dismissFindingInDb(
  db: Db,
  writes: ProjectWriteCollector,
  finding: Finding,
  reason: Dismissal["reason"],
  note: string,
  at: string,
  options: { bulk?: boolean },
): void {
  finding.status = "dismissed";
  finding.dismissal = { reason, note, at };
  writes.upsertFinding(finding);
  writes.addEvidence({
    kind: "finding",
    summary: `Finding dismissed (${reason}): ${finding.checkId} at ${formatLocationRef(finding.location)}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: options.bulk
      ? { event: "dismissed", reason, note, bulk: true }
      : { event: "dismissed", reason, note },
  });
}

export async function approveRemediationAction(
  findingIdRaw: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    await withProjectWrite(
      { touch: "entities", findingIds: [findingId] },
      async (workspace, writes) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

      approveRemediationInDb(db, writes, finding, remediation, {
        approvalNote: "Approved by user",
      });
    },
    );
    refresh();
    return "Remediation approved.";
  });
}

/** Approves remediations that are already in `suggested` (skips others). */
export async function bulkApproveRemediationsAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { findingIds } = parseForm(bulkApproveInput, formData);
    let approved = 0;

    await withProjectWrite(
      { touch: "entities", findingIds },
      async (workspace, writes) => {
      const { db } = workspace;
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        const remediation = remediationForFinding(db, findingId);
        if (!canBulkApproveRemediation(finding, remediation.status)) continue;

        approveRemediationInDb(db, writes, finding, remediation, {
          bulk: true,
          approvalNote: "Approved in bulk",
        });
        approved += 1;
      }
    },
    );

    if (approved === 0) {
      throw new PublicError(
        "No selected findings had runtime guidance ready to approve.",
      );
    }
    refresh();
    return `Approved ${approved} remediation${approved === 1 ? "" : "s"}.`;
  });
}

export async function dismissFindingAction(
  findingIdRaw: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const { reason, note } = parseForm(dismissFindingInput, formData);
    await withProjectWrite(
      { touch: "entities", findingIds: [findingId] },
      async (workspace, writes) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");

      dismissFindingInDb(
        db,
        writes,
        finding,
        reason,
        note ?? "",
        new Date().toISOString(),
        {},
      );
      refreshRequirementStatusesForControls(db, finding.projectId, [
        finding.controlId,
      ], { writes });
    },
    );
    refresh();
    return "Finding dismissed.";
  });
}

export async function bulkDismissFindingsAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { findingIds, reason, note } = parseForm(bulkDismissInput, formData);
    const dismissalNote = note ?? "";
    const at = new Date().toISOString();
    let dismissed = 0;
    const projectIds = new Set<string>();

    await withProjectWrite(
      { touch: "entities", findingIds },
      async (workspace, writes) => {
      const { db } = workspace;
      const refreshedControlIds = new Set<string>();
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        if (finding.status !== "open") continue;

        dismissFindingInDb(db, writes, finding, reason, dismissalNote, at, {
          bulk: true,
        });
        projectIds.add(finding.projectId);
        refreshedControlIds.add(finding.controlId);
        dismissed += 1;
      }
      for (const projectId of projectIds) {
        refreshRequirementStatusesForControls(
          db,
          projectId,
          [...refreshedControlIds],
          { writes },
        );
      }
    },
    );

    if (dismissed === 0) {
      throw new PublicError("No open findings were dismissed.");
    }
    refresh();
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
