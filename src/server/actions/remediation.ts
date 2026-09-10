"use server";

import { canBulkApproveRemediation } from "@/core/lifecycle";
import { type Finding, type Remediation } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  DISMISSAL_REASONS,
  type Dismissal,
} from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { advanceRemediation } from "@/core/lifecycle";
import {
  entityIdSchema,
  findingIdsField,
  optionalNoteSchema,
  parseForm,
  parseInput,
} from "@/core/filters";
import { z } from "zod";
import {
  runAction,
  type ActionState,
} from "../action-state";
import { applyRequirementStatusRefresh } from "../assessment-status";
import {
  findingById,
  remediationForFinding,
} from "../workspace";
import { withFindingWrite, withProjectWrite } from "../workspace-write";
import {
  appendEvidence,
  cloneProjectRows,
  upsertFindingInRows,
  type ProjectRows,
} from "../project-rows";
import { remediationEvidenceDetail, remediationEvidenceSummary } from "../remediation-evidence";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

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

function approveRemediationInPayload(
  payload: ProjectWritePayload,
  finding: Finding,
  remediation: Remediation,
  options: { bulk?: boolean; approvalNote: string },
): void {
  replaceRemediation(
    payload,
    advanceRemediation(remediation, "approved", options.approvalNote),
  );
  appendEvidence(payload, {
    kind: "remediation_approved",
    summary: remediationEvidenceSummary("approved", finding),
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: remediationEvidenceDetail({
      ...(options.bulk ? { bulk: true } : {}),
      ...(finding.fix ? { fix: { ...finding.fix } } : {}),
    }),
  });
}

function dismissFindingInRows(
  rows: ProjectRows,
  finding: Finding,
  reason: Dismissal["reason"],
  note: string,
  at: string,
  options: { bulk?: boolean },
): Finding {
  const updated: Finding = {
    ...finding,
    status: "dismissed",
    dismissal: { reason, note, at },
  };
  upsertFindingInRows(rows, updated);
  appendEvidence(rows, {
    kind: "finding",
    summary: `Finding dismissed (${reason}): ${finding.checkId} at ${formatLocationRef(finding.location)}`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: options.bulk
      ? { event: "dismissed", reason, note, bulk: true }
      : { event: "dismissed", reason, note },
  });
  return updated;
}

export async function approveRemediationAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding }) => {
        const remediation = remediationForFinding(db, findingId);
        const payload: ProjectWritePayload = {};

        approveRemediationInPayload(payload, finding, remediation, {
          approvalNote: "Approved by user",
        });
        return payload;
      },
    );
    refresh();
    return "Remediation approved.";
  });
}

/** Approves remediations that are already in `suggested` (skips others). */
export async function bulkApproveRemediationsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { findingIds } = parseForm(bulkApproveInput, formData);
    let approved = 0;

    await withProjectWrite(
      { touch: "entities", findingIds },
      async (workspace) => {
        const { db } = workspace;
        const payload: ProjectWritePayload = {};
        for (const findingId of findingIds) {
          const finding = findingById(db, findingId);
          requireOnFindingProject(workspace, finding, "project.remediate");
          const remediation = remediationForFinding(db, findingId);
          if (!canBulkApproveRemediation(finding, remediation.status)) continue;

          approveRemediationInPayload(payload, finding, remediation, {
            bulk: true,
            approvalNote: "Approved in bulk",
          });
          approved += 1;
        }
        return payload;
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
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const { reason, note } = parseForm(dismissFindingInput, formData);
    await withFindingWrite(findingId, "project.remediate", async ({ db, finding }) => {
      const project = db.projects.find(
        (candidate) => candidate.id === finding.projectId,
      );
      if (!project) throw new PublicError("Unknown project.");

      const rows = cloneProjectRows(
        db.findings,
        db.remediations,
        db.requirements,
        project.id,
      );
      const updated = dismissFindingInRows(
        rows,
        finding,
        reason,
        note ?? "",
        new Date().toISOString(),
        {},
      );
      applyRequirementStatusRefresh(rows, project, {
        controlIds: [finding.controlId],
      });
      return {
        findings: [updated],
        requirements: rows.requirements,
        evidence: rows.evidence,
      };
    });
    refresh();
    return "Finding dismissed.";
  });
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

    await withProjectWrite(
      { touch: "entities", findingIds },
      async (workspace) => {
        const { db } = workspace;
        const project = workspace.project;
        if (!project) throw new PublicError("Select a project first.");
        const rows = cloneProjectRows(
          db.findings,
          db.remediations,
          db.requirements,
          project.id,
        );
        const dismissedFindings: Finding[] = [];
        const controlIds = new Set<string>();
        for (const findingId of findingIds) {
          const finding = findingById(db, findingId);
          requireOnFindingProject(workspace, finding, "project.remediate");
          if (finding.status !== "open") continue;

          dismissedFindings.push(
            dismissFindingInRows(rows, finding, reason, dismissalNote, at, {
              bulk: true,
            }),
          );
          controlIds.add(finding.controlId);
          dismissed += 1;
        }
        applyRequirementStatusRefresh(rows, project, {
          controlIds: [...controlIds],
        });
        return {
          findings: dismissedFindings,
          requirements: rows.requirements,
          evidence: rows.evidence,
        };
      },
    );

    if (dismissed === 0) {
      throw new PublicError("No open findings were dismissed.");
    }
    refresh();
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
