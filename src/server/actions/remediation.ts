"use server";

import { formatLocationRef, isDomLocation } from "@/core/location";
import { PublicError } from "@/core/public-error";
import { advanceRemediation } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { addEvidence } from "../db";
import {
  findingById,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

export async function approveRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

      replaceRemediation(
        db,
        advanceRemediation(remediation, "approved", "Approved by user"),
      );
      addEvidence(db, {
        kind: "remediation_approved",
        summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: finding.fix ? { fix: { ...finding.fix } } : undefined,
      });
    });
    refresh();
    return "Remediation approved.";
  });
}

function readFindingIds(formData: FormData): string[] {
  const raw = formData.getAll("findingIds");
  const ids = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(ids)];
}

/** Approves remediations that are already in `suggested` (skips others). */
export async function bulkApproveRemediationsAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingIds = readFindingIds(formData);
    if (findingIds.length === 0) {
      throw new PublicError("Select at least one finding to approve.");
    }
    let approved = 0;

    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      for (const findingId of findingIds) {
        const finding = findingById(db, findingId);
        requireOnFindingProject(workspace, finding, "project.remediate");
        if (finding.status !== "open") continue;
        const remediation = remediationForFinding(db, findingId);
        if (remediation.status !== "suggested") continue;
        if (!isDomLocation(finding.location)) continue;

        replaceRemediation(
          db,
          advanceRemediation(remediation, "approved", "Approved in bulk"),
        );
        addEvidence(db, {
          kind: "remediation_approved",
          summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: {
            bulk: true,
            ...(finding.fix ? { fix: { ...finding.fix } } : {}),
          },
        });
        approved += 1;
      }
    });

    if (approved === 0) {
      throw new PublicError(
        "No selected findings had runtime guidance ready to approve.",
      );
    }
    refresh();
    return `Approved ${approved} remediation${approved === 1 ? "" : "s"}.`;
  });
}
