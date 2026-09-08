"use server";

import { z } from "zod";
import type { Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import {
  REQUIREMENT_EXCEPTION_REASONS,
  TEMPORARY_EXCEPTION_REASON,
} from "@complyloop/analysis-core/contract/project-types";
import { entityIdSchema, requiredField } from "@/core/boundary";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseInput } from "../boundary";
import { applyRequirementStatusRefresh } from "../assessment-status";
import type { Db } from "../db";
import { controlById } from "../workspace";
import { withProjectWrite } from "../workspace-write";
import { appendEvidence, cloneProjectRows } from "../project-rows";
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
): ProjectWritePayload {
  const control = controlById(requirement.controlId);
  const updated: Requirement = {
    ...requirement,
    determination: "automated",
    updatedAt: new Date().toISOString(),
  };

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
    delete updated.humanPass;
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
    delete updated.exception;
    appendEvidence(rows, {
      kind: "requirement_exception_cleared",
      summary: `${control.code} exception cleared (was ${previousException.reason})`,
      projectId: project.id,
      controlId: requirement.controlId,
      detail: { previousException },
    });
  }

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
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const requirementId = parseInput(entityIdSchema, requirementIdRaw);
    const parsed = parseForm(markExceptionInput, formData);
    await withProjectWrite(
      { touch: "entities", requirementIds: [requirementId] },
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

        const updated: Requirement = {
          ...requirement,
          exception: {
            reason,
            note,
            at: new Date().toISOString(),
            expiresAt,
          },
          determination: "human_review",
          updatedAt: new Date().toISOString(),
        };
        delete updated.humanPass;
        if (reason === "not_applicable") {
          updated.status = "not_applicable";
        }

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
    await withProjectWrite(
      { touch: "entities", requirementIds: [requirementId] },
      async (workspace) => {
        requireOnActive(workspace, "project.remediate");
        const { db, project } = workspace;
        const requirement = requireRequirement(
          db,
          project.id,
          requirementId,
        );

        const control = controlById(requirement.controlId);
        if (control.checkId !== null) {
          throw new PublicError(
            "Only manual controls (no automated check) can be marked passed by human review.",
          );
        }

        const previous = requirement.status;
        const updated: Requirement = {
          ...requirement,
          humanPass: {
            note,
            at: new Date().toISOString(),
          },
          status: "passed",
          determination: "human_review",
          updatedAt: new Date().toISOString(),
        };
        delete updated.exception;

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
    await withProjectWrite(
      { touch: "entities", requirementIds: [requirementId] },
      async (workspace) => {
        requireOnActive(workspace, "project.remediate");
        const { db, project } = workspace;
        const requirement = requireRequirement(
          db,
          project.id,
          requirementId,
        );
        return clearRequirementOverride(db, project, requirement, field);
      },
    );
    refresh();
    return message;
  });
}
