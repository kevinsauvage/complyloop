"use server";

import { z } from "zod";

import {
  type Requirement,
  REQUIREMENT_EXCEPTION_REASONS,
  TEMPORARY_EXCEPTION_REASON,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { WorkspaceSlice } from "@complyloop/db/types";

import type { ActionState } from "@/core/action-state";
import {
  clearRequirementHumanDetermination,
  normalizeExpiryInstant,
  setRequirementHumanDetermination,
} from "@/core/requirement-human-determination";
import { parseEntityId, parseForm, requiredField } from "@/core/validate";

import { applyRequirementStatusRefresh } from "../assessment/assessment-status";
import { appendEvidence, cloneProjectRows } from "../workspace/project-rows";
import { controlById } from "../workspace/workspace";
import { runProjectAction } from "./define-action";
import { requireOnActive } from "./shared";

const markExceptionInput = z
  .object({
    reason: z.enum(REQUIREMENT_EXCEPTION_REASONS, {
      error: "A valid exception reason is required.",
    }),
    note: requiredField(
      "A note is required when setting a requirement exception.",
      2000,
    ),
    expiresAt: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason !== TEMPORARY_EXCEPTION_REASON) return;
    const raw = value.expiresAt;
    if (raw == null || raw.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Temporary exceptions require an expiry date.",
      });
      return;
    }
    const instant = normalizeExpiryInstant(raw);
    if (!instant) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Enter a valid expiry date (YYYY-MM-DD).",
      });
      return;
    }
    if (instant <= new Date().toISOString()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry date must be in the future.",
      });
    }
  });

const markPassedInput = z.object({
  note: requiredField(
    "A note is required when marking a requirement passed.",
    2000,
  ),
});

function requireRequirement(
  db: WorkspaceSlice,
  projectId: string,
  requirementId: string,
): Requirement {
  const requirement = db.requirements.find(
    (candidate) => candidate.id === requirementId,
  );
  if (!requirement || requirement.projectId !== projectId) {
    throw new PublicError("Unknown requirement.");
  }
  return requirement;
}

function clearRequirementOverride(
  db: WorkspaceSlice,
  project: Project,
  requirement: Requirement,
  field: "humanPass" | "exception",
): ProjectWritePayload {
  const control = controlById(requirement.controlId);
  const rows = cloneProjectRows(
    db.findings,
    db.remediations,
    db.requirements,
    project.id,
  );

  if (field === "humanPass") {
    if (!requirement.humanPass) {
      throw new PublicError("This requirement has no human pass to clear.");
    }
    const previousPass = requirement.humanPass;
    appendEvidence(rows, {
      kind: "requirement_human_pass_cleared",
      summary: `${control.code} human pass cleared`,
      projectId: project.id,
      controlId: requirement.controlId,
      detail: { previousPass },
    });
  } else {
    if (!requirement.exception) {
      throw new PublicError("This requirement has no exception to clear.");
    }
    const previousException = requirement.exception;
    appendEvidence(rows, {
      kind: "requirement_exception_cleared",
      summary: `${control.code} exception cleared (was ${previousException.reason})`,
      projectId: project.id,
      controlId: requirement.controlId,
      detail: { previousException },
    });
  }

  const updated = clearRequirementHumanDetermination(requirement, field);
  const index = rows.requirements.findIndex(
    (candidate) => candidate.id === requirement.id,
  );
  if (index >= 0) {
    rows.requirements[index] = updated;
  } else {
    rows.requirements.push(updated);
  }
  applyRequirementStatusRefresh(rows, project, {
    controlIds: [requirement.controlId],
  });
  return {
    requirements: rows.requirements,
    evidence: rows.evidence,
  };
}

export async function markRequirementExceptionAction(
  requirementIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runProjectAction(async (workspace) => {
    const requirementId = parseEntityId(requirementIdRaw);
    const parsed = parseForm(markExceptionInput, formData);
    requireOnActive(workspace, "project.remediate");
    const { db, project } = workspace;
    const requirement = requireRequirement(db, project.id, requirementId);

    const { reason, note } = parsed;
    const expiresRaw = parsed.expiresAt;
    const expiresAt =
      reason === TEMPORARY_EXCEPTION_REASON && typeof expiresRaw === "string"
        ? (normalizeExpiryInstant(expiresRaw) ?? undefined)
        : undefined;

    const { updated, previous } = setRequirementHumanDetermination(
      requirement,
      {
        kind: "exception",
        exception: {
          reason,
          note,
          at: new Date().toISOString(),
          expiresAt,
        },
        nextStatus: reason === "not_applicable" ? "not_applicable" : undefined,
      },
    );

    const payload: ProjectWritePayload = {};
    const control = controlById(requirement.controlId);
    appendEvidence(payload, {
      kind: "requirement_exception_set",
      summary: `${control.code} exception (${reason}): ${note}${expiresAt ? ` (expires ${expiresAt})` : ""}`,
      projectId: project.id,
      controlId: requirement.controlId,
      detail: {
        reason,
        note,
        expiresAt,
        from: previous,
        to: updated.status,
      },
    });
    if (previous !== updated.status) {
      appendEvidence(payload, {
        kind: "requirement_status_changed",
        summary: `${control.code} (${control.title}): ${previous} → ${updated.status} — human exception`,
        projectId: project.id,
        controlId: requirement.controlId,
        detail: { from: previous, to: updated.status, regression: false },
      });
    }
    payload.requirements = [updated];
    return payload;
  }, "Exception recorded.");
}

export async function markRequirementPassedAction(
  requirementIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runProjectAction(async (workspace) => {
    const requirementId = parseEntityId(requirementIdRaw);
    const { note } = parseForm(markPassedInput, formData);
    requireOnActive(workspace, "project.remediate");
    const { db, project } = workspace;
    const requirement = requireRequirement(db, project.id, requirementId);

    const control = controlById(requirement.controlId);
    if (control.checkId !== null) {
      throw new PublicError(
        "Only manual controls (no automated check) can be marked passed by human review.",
      );
    }

    const { updated, previous } = setRequirementHumanDetermination(
      requirement,
      {
        kind: "humanPass",
        humanPass: {
          note,
          at: new Date().toISOString(),
        },
      },
    );

    const payload: ProjectWritePayload = {};
    appendEvidence(payload, {
      kind: "requirement_human_passed",
      summary: `${control.code} marked passed (human review): ${note}`,
      projectId: project.id,
      controlId: requirement.controlId,
      detail: { note, from: previous, to: "passed" },
    });
    if (previous !== "passed") {
      appendEvidence(payload, {
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
    payload.requirements = [updated];
    return payload;
  }, "Human pass recorded.");
}

export async function clearRequirementHumanPassAction(
  requirementIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return clearRequirementOverrideAction(
    requirementIdRaw,
    "humanPass",
    "Human pass cleared.",
  );
}

export async function clearRequirementExceptionAction(
  requirementIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return clearRequirementOverrideAction(
    requirementIdRaw,
    "exception",
    "Exception cleared.",
  );
}

async function clearRequirementOverrideAction(
  requirementIdRaw: string,
  field: "humanPass" | "exception",
  message: string,
): Promise<ActionState> {
  return runProjectAction(async (workspace) => {
    const requirementId = parseEntityId(requirementIdRaw);
    requireOnActive(workspace, "project.remediate");
    const { db, project } = workspace;
    const requirement = requireRequirement(db, project.id, requirementId);
    return clearRequirementOverride(db, project, requirement, field);
  }, message);
}
