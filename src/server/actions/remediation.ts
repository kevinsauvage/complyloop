"use server";

import { canBulkApproveRemediation } from "@/core/finding-act";
import { type Finding, type Remediation } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { type Dismissal } from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
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
import { applyEntityWrite } from "../assessment-status";
import {
  findingById,
  remediationForFinding,
} from "../workspace";
import { withProjectWrite } from "../workspace-write";
import { evidenceEntry } from "../evidence-payload";
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
  evidenceEntry(payload, {
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

function dismissFindingInPayload(
  payload: ProjectWritePayload,
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
  payload.findings = [...(payload.findings ?? []), updated];
  evidenceEntry(payload, {
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
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    await withProjectWrite(
      { touch: "entities", findingIds: [findingId] },
      async (workspace) => {
        const { db } = workspace;
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
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
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
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
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const { reason, note } = parseForm(dismissFindingInput, formData);
    await withProjectWrite(
      { touch: "entities", findingIds: [findingId] },
      async (workspace) => {
        const { db } = workspace;
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        const project = db.projects.find(
          (candidate) => candidate.id === finding.projectId,
        );
        if (!project) throw new PublicError("Unknown project.");
        const payload: ProjectWritePayload = {};

        dismissFindingInPayload(
          payload,
          finding,
          reason,
          note ?? "",
          new Date().toISOString(),
          {},
        );
        applyEntityWrite(payload, {
          project,
          findings: db.findings,
          requirements: db.requirements,
          controlIds: [finding.controlId],
        });
        return payload;
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

    await withProjectWrite(
      { touch: "entities", findingIds },
      async (workspace) => {
        const { db } = workspace;
        const payload: ProjectWritePayload = {};
        const refreshedByProject = new Map<
          string,
          { projectId: string; controlIds: Set<string> }
        >();
        for (const findingId of findingIds) {
          const finding = findingById(db, findingId);
          requireOnFindingProject(workspace, finding, "project.remediate");
          if (finding.status !== "open") continue;

          dismissFindingInPayload(payload, finding, reason, dismissalNote, at, {
            bulk: true,
          });
          const entry = refreshedByProject.get(finding.projectId) ?? {
            projectId: finding.projectId,
            controlIds: new Set<string>(),
          };
          entry.controlIds.add(finding.controlId);
          refreshedByProject.set(finding.projectId, entry);
          dismissed += 1;
        }
        for (const { projectId, controlIds } of refreshedByProject.values()) {
          const project = db.projects.find(
            (candidate) => candidate.id === projectId,
          );
          if (!project) continue;
          applyEntityWrite(payload, {
            project,
            findings: db.findings,
            requirements: db.requirements,
            controlIds: [...controlIds],
          });
        }
        return payload;
      },
    );

    if (dismissed === 0) {
      throw new PublicError("No open findings were dismissed.");
    }
    refresh();
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
