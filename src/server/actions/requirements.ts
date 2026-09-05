"use server";

import { z } from "zod";
import type { Project, Requirement } from "@complyloop/domain/project-types";
import {
  REQUIREMENT_EXCEPTION_REASONS,
  TEMPORARY_EXCEPTION_REASON,
} from "@complyloop/domain/project-types";
import { entityIdSchema, requiredField } from "@/core/boundary";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseInput } from "../boundary";
import { refreshRequirementStatusesForControls } from "../assessment-status";
import { addEvidence, type Db } from "../db";
import { controlById, withTargetedProjectWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

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
    if (value.expiresAt == null || value.expiresAt.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Temporary exceptions require an expiry date.",
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
  db: Db,
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
  db: Db,
  project: Project,
  requirement: Requirement,
  field: "humanPass" | "exception",
): void {
  const control = controlById(db, requirement.controlId);

  if (field === "humanPass") {
    if (!requirement.humanPass) {
      throw new PublicError("This requirement has no human pass to clear.");
    }
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
  } else {
    if (!requirement.exception) {
      throw new PublicError("This requirement has no exception to clear.");
    }
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
  }

  refreshRequirementStatusesForControls(db, project.id, [requirement.controlId]);
}

export async function markRequirementExceptionAction(
  requirementIdRaw: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const requirementId = parseInput(entityIdSchema, requirementIdRaw);
    const parsed = parseForm(markExceptionInput, formData);
    await withTargetedProjectWrite(
      { requirementIds: [requirementId] },
      async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = requireRequirement(
        db,
        project.id,
        requirementId,
      );

      const { reason, note } = parsed;
      const expiresRaw = parsed.expiresAt;
      const previous = requirement.status;
      const expiresAt =
        reason === TEMPORARY_EXCEPTION_REASON && typeof expiresRaw === "string"
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
    },
    );
    refresh();
    return "Exception recorded.";
  });
}

export async function markRequirementPassedAction(
  requirementIdRaw: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const requirementId = parseInput(entityIdSchema, requirementIdRaw);
    const { note } = parseForm(markPassedInput, formData);
    await withTargetedProjectWrite(
      { requirementIds: [requirementId] },
      async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = requireRequirement(
        db,
        project.id,
        requirementId,
      );

      const control = controlById(db, requirement.controlId);
      if (control.checkId !== null) {
        throw new PublicError(
          "Only manual controls (no automated check) can be marked passed by human review.",
        );
      }

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
    },
    );
    refresh();
    return "Human pass recorded.";
  });
}

export async function clearRequirementHumanPassAction(
  requirementIdRaw: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return clearRequirementOverrideAction(
    requirementIdRaw,
    previous,
    formData,
    "humanPass",
    "Human pass cleared.",
  );
}

export async function clearRequirementExceptionAction(
  requirementIdRaw: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return clearRequirementOverrideAction(
    requirementIdRaw,
    previous,
    formData,
    "exception",
    "Exception cleared.",
  );
}

async function clearRequirementOverrideAction(
  requirementIdRaw: string,
  _previous: ActionMessageState,
  _formData: FormData,
  field: "humanPass" | "exception",
  message: string,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    const requirementId = parseInput(entityIdSchema, requirementIdRaw);
    await withTargetedProjectWrite(
      { requirementIds: [requirementId] },
      async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      const requirement = requireRequirement(
        db,
        project.id,
        requirementId,
      );
      clearRequirementOverride(db, project, requirement, field);
    },
    );
    refresh();
    return message;
  });
}
