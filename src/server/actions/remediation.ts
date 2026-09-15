"use server";

import { z } from "zod";

import {
  type EvidenceRecord,
  type Finding,
  type Remediation,
  type Requirement,
} from "@complyloop/analysis-core/contract/entities";
import {
  type Dismissal,
  DISMISSAL_REASONS,
} from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { WorkspaceSlice } from "@complyloop/db/types";

import {
  advanceRemediation,
  canBulkApproveRemediation,
} from "@/core/remediation-lifecycle";
import {
  findingIdsField,
  optionalNoteSchema,
  parseForm,
} from "@/core/validate";

import type { ActionState } from "../action-state";
import { runAction } from "../action-state";
import { applyRequirementStatusRefresh } from "../assessment/assessment-status";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import {
  appendEvidence,
  cloneProjectRows,
  type ProjectRows,
  upsertFindingInRows,
} from "../workspace/project-rows";
import { findingById, remediationForFinding } from "../workspace/workspace";
import { withProjectWrite } from "../workspace/workspace-write";
import { runFindingAction } from "./define-action";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, replaceRemediation, requireOnFindingProject } from "./shared";

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
  if (finding.status !== "open") {
    throw new PublicError("Only open findings can be dismissed.");
  }
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

/**
 * Shared single/bulk dismiss core: clones rows once, dismisses each entry,
 * refreshes touched controls, and returns the persistable payload slice.
 * Callers keep their own guards (single throws on non-open; bulk skips).
 */
function dismissEntriesInWrite(
  db: WorkspaceSlice,
  project: Project,
  entries: ReadonlyArray<{
    finding: Finding;
    reason: Dismissal["reason"];
    note: string;
  }>,
  options: { bulk?: boolean; at: string },
): {
  findings: Finding[];
  requirements: Requirement[];
  evidence: EvidenceRecord[];
} {
  const rows = cloneProjectRows(
    db.findings,
    db.remediations,
    db.requirements,
    project.id,
  );
  const controlIds = new Set<string>();
  const findings: Finding[] = [];
  for (const entry of entries) {
    findings.push(
      dismissFindingInRows(
        rows,
        entry.finding,
        entry.reason,
        entry.note,
        options.at,
        {
          bulk: options.bulk,
        },
      ),
    );
    controlIds.add(entry.finding.controlId);
  }
  // A human dismiss is not an automated pass. Force a no-scan audit
  // context so standard controls resolve to unable_to_verify (not passed)
  // and runtime/site controls stay unable_to_verify without an engine run.
  // Human attribution lives on the "finding dismissed" evidence above.
  applyRequirementStatusRefresh(rows, project, {
    controlIds: [...controlIds],
    runtimeRan: false,
    filesScanned: 0,
  });
  return {
    findings,
    requirements: rows.requirements,
    evidence: rows.evidence,
  };
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
    async ({ db, finding }) => {
      const remediation = remediationForFinding(db, finding.id);
      const payload: ProjectWritePayload = {};

      approveRemediationInPayload(payload, finding, remediation, {
        approvalNote: "Approved by user",
      });
      return payload;
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

    await withProjectWrite(async (workspace) => {
      const { db } = workspace;
      const payload: ProjectWritePayload = {};
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        const remediation = remediationForFinding(db, findingId);
        if (
          !canBulkApproveRemediation(
            finding,
            remediation.status,
            remediation.suggestion,
          )
        )
          continue;

        approveRemediationInPayload(payload, finding, remediation, {
          bulk: true,
          approvalNote: "Approved in bulk",
        });
        approved += 1;
      }
      return payload;
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
    async ({ db, finding }) => {
      const { reason, note } = parseForm(dismissFindingInput, formData);
      const project = db.projects.find(
        (candidate) => candidate.id === finding.projectId,
      );
      if (!project) throw new PublicError("Unknown project.");
      return dismissEntriesInWrite(
        db,
        project,
        [{ finding, reason, note: note ?? "" }],
        { at: new Date().toISOString() },
      );
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

    await withProjectWrite(async (workspace) => {
      const { db } = workspace;
      const project = workspace.project;
      if (!project) throw new PublicError("Select a project first.");
      const entries: Array<{
        finding: Finding;
        reason: Dismissal["reason"];
        note: string;
      }> = [];
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        if (finding.status !== "open") continue;
        entries.push({ finding, reason, note: dismissalNote });
      }
      if (entries.length === 0) {
        throw new PublicError("No open findings were dismissed.");
      }
      dismissed = entries.length;
      return dismissEntriesInWrite(db, project, entries, {
        bulk: true,
        at,
      });
    });

    refresh(...COMPLIANCE_LOOP_ROUTES);
    return `Dismissed ${dismissed} finding${dismissed === 1 ? "" : "s"}.`;
  });
}
