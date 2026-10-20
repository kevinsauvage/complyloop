"use server";

import { z } from "zod";

import {
  type Requirement,
  REQUIREMENT_EXCEPTION_REASONS,
  TEMPORARY_EXCEPTION_REASON,
} from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { DrizzleDb } from "@complyloop/db/postgres";
import {
  insertEvidence,
  insertEvidenceRecords,
} from "@complyloop/db/repo/evidence";
import {
  getRequirementById,
  upsertRequirements,
} from "@complyloop/db/repo/requirements";

import type { ActionState } from "@/core/actions/action-state";
import {
  parseEntityId,
  parseForm,
  requiredField,
} from "@/core/actions/validate";
import {
  clearRequirementHumanDetermination,
  normalizeExpiryInstant,
  setRequirementHumanDetermination,
} from "@/core/requirements/requirement-human-determination";

import { refreshRequirementsForControls } from "../assessment/assessment-status";
import { assertRequirementsRateLimit } from "../rate-limit";
import { stampEvidenceActor } from "../workspace/project-rows";
import { controlById } from "../workspace/workspace";
import type { ProjectTx } from "../workspace/workspace-write";
import { runProjectAction } from "./define-action";

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

async function requireRequirement(
  tx: DrizzleDb,
  projectId: string,
  requirementId: string,
): Promise<Requirement> {
  const requirement = await getRequirementById(tx, requirementId);
  if (!requirement || requirement.projectId !== projectId) {
    throw new PublicError("Unknown requirement.");
  }
  return requirement;
}

/**
 * Clear one human override and re-derive the control's status from the rows
 * that remain. The cleared row is written first: the refresh reads the control's
 * requirement and open findings inside the same transaction, so a cleared
 * (non-sticky) requirement re-derives from its findings.
 */
async function clearRequirementOverride(
  ctx: ProjectTx,
  requirementId: string,
  field: "humanPass" | "exception",
): Promise<void> {
  const requirement = await requireRequirement(
    ctx.tx,
    ctx.project.id,
    requirementId,
  );
  const control = controlById(requirement.controlId);

  if (field === "humanPass") {
    if (!requirement.humanPass) {
      throw new PublicError("This requirement has no human pass to clear.");
    }
    await insertEvidence(ctx.tx, {
      kind: "requirement_human_pass_cleared",
      summary: `${control.code} human pass cleared`,
      projectId: ctx.project.id,
      controlId: requirement.controlId,
      detail: { previousPass: requirement.humanPass },
      actor: ctx.actor,
    });
  } else {
    if (!requirement.exception) {
      throw new PublicError("This requirement has no exception to clear.");
    }
    await insertEvidence(ctx.tx, {
      kind: "requirement_exception_cleared",
      summary: `${control.code} exception cleared (was ${requirement.exception.reason})`,
      projectId: ctx.project.id,
      controlId: requirement.controlId,
      detail: { previousException: requirement.exception },
      actor: ctx.actor,
    });
  }

  await upsertRequirements(ctx.tx, [
    clearRequirementHumanDetermination(requirement, field),
  ]);

  const refreshed = await refreshRequirementsForControls(ctx.tx, ctx.project, [
    requirement.controlId,
  ]);
  await upsertRequirements(ctx.tx, refreshed.requirements);
  stampEvidenceActor(refreshed.evidence, ctx.actor);
  await insertEvidenceRecords(ctx.tx, refreshed.evidence);
}

export async function markRequirementExceptionAction(
  requirementIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runProjectAction(
    "project.remediate",
    async (ctx) => {
      const requirementId = parseEntityId(requirementIdRaw);
      const parsed = parseForm(markExceptionInput, formData);
      if (ctx.userId) await assertRequirementsRateLimit(ctx.userId);
      const requirement = await requireRequirement(
        ctx.tx,
        ctx.project.id,
        requirementId,
      );

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
          nextStatus:
            reason === "not_applicable" ? "not_applicable" : undefined,
        },
      );

      const control = controlById(requirement.controlId);
      await insertEvidence(ctx.tx, {
        kind: "requirement_exception_set",
        summary: `${control.code} exception (${reason}): ${note}${expiresAt ? ` (expires ${expiresAt})` : ""}`,
        projectId: ctx.project.id,
        controlId: requirement.controlId,
        detail: {
          reason,
          note,
          expiresAt,
          from: previous,
          to: updated.status,
        },
        actor: ctx.actor,
      });
      if (previous !== updated.status) {
        await insertEvidence(ctx.tx, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → ${updated.status} — human exception`,
          projectId: ctx.project.id,
          controlId: requirement.controlId,
          detail: { from: previous, to: updated.status, regression: false },
          actor: ctx.actor,
        });
      }
      await upsertRequirements(ctx.tx, [updated]);
    },
    "Exception recorded.",
  );
}

export async function markRequirementPassedAction(
  requirementIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runProjectAction(
    "project.remediate",
    async (ctx) => {
      const requirementId = parseEntityId(requirementIdRaw);
      const { note } = parseForm(markPassedInput, formData);
      if (ctx.userId) await assertRequirementsRateLimit(ctx.userId);
      const requirement = await requireRequirement(
        ctx.tx,
        ctx.project.id,
        requirementId,
      );

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

      await insertEvidence(ctx.tx, {
        kind: "requirement_human_passed",
        summary: `${control.code} marked passed (human review): ${note}`,
        projectId: ctx.project.id,
        controlId: requirement.controlId,
        detail: { note, from: previous, to: "passed" },
        actor: ctx.actor,
      });
      if (previous !== "passed") {
        await insertEvidence(ctx.tx, {
          kind: "requirement_status_changed",
          summary: `${control.code} (${control.title}): ${previous} → passed — human review`,
          projectId: ctx.project.id,
          controlId: requirement.controlId,
          detail: {
            from: previous,
            to: "passed",
            regression: false,
            humanPass: true,
          },
          actor: ctx.actor,
        });
      }
      await upsertRequirements(ctx.tx, [updated]);
    },
    "Human pass recorded.",
  );
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
  return runProjectAction(
    "project.remediate",
    async (ctx) => {
      const requirementId = parseEntityId(requirementIdRaw);
      if (ctx.userId) await assertRequirementsRateLimit(ctx.userId);
      await clearRequirementOverride(ctx, requirementId, field);
    },
    message,
  );
}
