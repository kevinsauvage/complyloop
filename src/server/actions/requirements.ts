"use server";

import type { RequirementExceptionReason } from "@/core/types";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { refreshRequirementStatuses } from "../assessment-status";
import { addEvidence } from "../db";
import { controlById, withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

function isRequirementExceptionReason(
  value: unknown,
): value is RequirementExceptionReason {
  return (
    value === "not_applicable" ||
    value === "accepted_risk" ||
    value === "compensating_control" ||
    value === "temporary"
  );
}

export async function markRequirementExceptionAction(
  requirementId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }

      const reason = formData.get("reason");
      const noteRaw = formData.get("note");
      const expiresRaw = formData.get("expiresAt");
      if (!isRequirementExceptionReason(reason)) {
        throw new Error("A valid exception reason is required.");
      }
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new Error(
          "A note is required when setting a requirement exception.",
        );
      }
      if (reason === "temporary") {
        if (typeof expiresRaw !== "string" || expiresRaw.trim().length === 0) {
          throw new Error("Temporary exceptions require an expiry date.");
        }
      }

      const note = noteRaw.trim();
      const previous = requirement.status;
      const expiresAt =
        reason === "temporary" && typeof expiresRaw === "string"
          ? new Date(expiresRaw).toISOString()
          : undefined;

      requirement.exception = {
        reason,
        note,
        at: new Date().toISOString(),
        expiresAt,
      };
      delete requirement.humanPass;
      requirement.determination = "human_review";
      if (reason === "not_applicable") {
        requirement.status = "not_applicable";
      }
      requirement.updatedAt = new Date().toISOString();

      const control = controlById(db, requirement.controlId);
      addEvidence(db, {
        kind: "requirement_exception_set",
        summary: `${control.code} exception (${reason}): ${note}${expiresAt ? ` (expires ${expiresAt})` : ""}`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: {
          reason,
          note,
          expiresAt,
          from: previous,
          to: requirement.status,
        },
      });
      if (previous !== requirement.status) {
        addEvidence(db, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → ${requirement.status} — human exception`,
          projectId: project.id,
          controlId: requirement.controlId,
          detail: { from: previous, to: requirement.status, regression: false },
        });
      }
    });
    refresh();
    return "Exception recorded.";
  });
}

export async function markRequirementPassedAction(
  requirementId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }

      const control = controlById(db, requirement.controlId);
      if (control.checkId !== null) {
        throw new Error(
          "Only manual controls (no automated check) can be marked passed by human review.",
        );
      }

      const noteRaw = formData.get("note");
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new Error("A note is required when marking a requirement passed.");
      }
      const note = noteRaw.trim();
      const previous = requirement.status;

      delete requirement.exception;
      requirement.humanPass = {
        note,
        at: new Date().toISOString(),
      };
      requirement.status = "passed";
      requirement.determination = "human_review";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_human_passed",
        summary: `${control.code} marked passed (human review): ${note}`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { note, from: previous, to: "passed" },
      });
      if (previous !== "passed") {
        addEvidence(db, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → passed — human review`,
          projectId: project.id,
          controlId: requirement.controlId,
          detail: {
            from: previous,
            to: "passed",
            regression: false,
            humanPass: true,
          },
        });
      }
    });
    refresh();
    return "Human pass recorded.";
  });
}

export async function clearRequirementHumanPassAction(
  requirementId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }
      if (!requirement.humanPass) {
        throw new Error("This requirement has no human pass to clear.");
      }

      const control = controlById(db, requirement.controlId);
      const previousPass = requirement.humanPass;
      delete requirement.humanPass;
      requirement.determination = "automated";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_human_pass_cleared",
        summary: `${control.code} human pass cleared`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { previousPass },
      });

      refreshRequirementStatuses(db, project.id);
    });
    refresh();
    return "Human pass cleared.";
  });
}

export async function clearRequirementExceptionAction(
  requirementId: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = db.requirements.find(
        (candidate) => candidate.id === requirementId,
      );
      if (!requirement || requirement.projectId !== project.id) {
        throw new Error("Unknown requirement.");
      }
      if (!requirement.exception) {
        throw new Error("This requirement has no exception to clear.");
      }

      const control = controlById(db, requirement.controlId);
      const previousException = requirement.exception;
      delete requirement.exception;
      requirement.determination = "automated";
      requirement.updatedAt = new Date().toISOString();

      addEvidence(db, {
        kind: "requirement_exception_cleared",
        summary: `${control.code} exception cleared (was ${previousException.reason})`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { previousException },
      });

      // Re-derive status from current open findings now that the exception is gone.
      refreshRequirementStatuses(db, project.id);
    });
    refresh();
    return "Exception cleared.";
  });
}
