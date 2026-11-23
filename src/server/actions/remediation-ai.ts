"use server";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import { getFindingById, upsertFindings } from "@complyloop/db/repo/findings";
import {
  getRemediationByFindingId,
  upsertRemediations,
} from "@complyloop/db/repo/remediations";

import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import type { ActionState } from "@/core/actions/action-state";
import { parseEntityId } from "@/core/actions/validate";
import { refreshSuggestion } from "@/core/requirements/remediation-lifecycle";

import { runAction } from "../action-state";
import { prepareAiCallForOrg } from "../ai/ai-config";
import { getSession } from "../auth-session";
import { reportError } from "../observability";
import { assertAiOrgRateLimit, assertAiRateLimit } from "../rate-limit";
import {
  controlById,
  requireFinding,
  requireProjectAccess,
  requireRemediationForFinding,
} from "../workspace/workspace";
import { withProjectTx } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

/**
 * Preview reads, access and rate limits shared by both actions. The AI call
 * runs BEFORE the transaction takes the project lock: holding a lock + open
 * transaction across LLM latency would block every other writer for this
 * project. Preview reads are single-row + the light project guard — no
 * tenancy load. Both actions write finding/remediation rows, so they need
 * remediate, not view: otherwise a read-only viewer could mutate findings and
 * spend AI credits by invoking an action directly.
 */
async function prepareFindingAiCall(findingIdRaw: string) {
  const findingId = parseEntityId(findingIdRaw);
  const previewFinding = await requireFinding(findingId);
  const project = await requireProjectAccess(
    previewFinding.projectId,
    "project.remediate",
  );
  const sessionUserId = (await getSession())?.user?.id;
  if (sessionUserId) await assertAiRateLimit(sessionUserId);
  await assertAiOrgRateLimit(project.orgId);
  return {
    findingId,
    previewFinding,
    project,
    control: controlById(previewFinding.controlId),
  };
}

/** AI may only refine an open finding's suggestion before approval. */
function assertRefinable<R extends Pick<Remediation, "status">>(
  finding: Pick<Finding, "status">,
  remediation: R | undefined,
): asserts remediation is R {
  if (finding.status !== "open") {
    throw new PublicError(
      "AI remediation is only available for open findings.",
    );
  }
  if (
    !remediation ||
    (remediation.status !== "detected" && remediation.status !== "suggested")
  ) {
    throw new PublicError(
      "AI remediation can only refine suggestions before approval.",
    );
  }
}

export async function generateAiExplanationAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const { findingId, previewFinding, project, control } =
      await prepareFindingAiCall(findingIdRaw);
    const config = await prepareAiCallForOrg(project.orgId);

    const explanation = await generateAiExplanation(
      previewFinding,
      control,
      config,
      { onError: reportError },
    );
    if (!explanation) {
      throw new PublicError(
        "AI explanation unavailable. Try again, or check this organization's AI settings under Organization → AI.",
      );
    }
    await withProjectTx(
      previewFinding.projectId,
      "project.remediate",
      async (ctx) => {
        const finding = await getFindingById(ctx.tx, findingId);
        if (!finding) throw new PublicError("Unknown finding.");
        // Persist onto the live row — the preview above may be stale.
        // Cap growth: deterministic baseline (index 0) + latest AI additions.
        // Every append rewrites the whole finding row, so unbounded clicks
        // would bloat it forever.
        const explanations = [...finding.explanations, explanation];
        await upsertFindings(ctx.tx, [
          {
            ...finding,
            explanations:
              explanations.length > 6
                ? [explanations[0]!, ...explanations.slice(-5)]
                : explanations,
          },
        ]);
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "AI explanation added.";
  });
}

export async function generateAiRemediationAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const { findingId, previewFinding, project, control } =
      await prepareFindingAiCall(findingIdRaw);
    assertRefinable(
      previewFinding,
      await requireRemediationForFinding(findingId),
    );

    const config = await prepareAiCallForOrg(project.orgId);
    const result = await generateAiRemediation(
      previewFinding,
      control,
      config,
      { onError: reportError },
    );
    if (!result) {
      throw new PublicError(
        "AI remediation unavailable. Try again, or check this organization's AI settings under Organization → AI.",
      );
    }

    await withProjectTx(
      previewFinding.projectId,
      "project.remediate",
      async (ctx) => {
        const finding = await getFindingById(ctx.tx, findingId);
        if (!finding) throw new PublicError("Unknown finding.");
        // The suggestion verdict was computed from preview data outside the
        // lock. Re-validate the live row before trusting it: the finding must
        // still be open with a pre-approval remediation, otherwise the stale
        // verdict must not decide the write.
        const remediation = await getRemediationByFindingId(ctx.tx, findingId);
        assertRefinable(finding, remediation);

        if (
          result.attributeValue &&
          finding.fix?.kind === "insert_attribute" &&
          finding.fix.editable
        ) {
          await upsertFindings(ctx.tx, [
            {
              ...finding,
              fix: { ...finding.fix, value: result.attributeValue },
            },
          ]);
        }

        await upsertRemediations(ctx.tx, [
          refreshSuggestion(remediation, result.suggestion),
        ]);

        await insertEvidence(ctx.tx, {
          kind: "ai_remediation_suggested",
          summary: `AI remediation suggested for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: {
            provenance: "ai",
            model: result.suggestion.model,
            confidence: result.suggestion.confidence,
            description: result.suggestion.description,
            // Staleness anchor: the finding's `assessmentId` is write-once
            // (creation assessment) so it cannot signal recency — the
            // suggestion-time location can. The finding page badges the
            // suggestion stale when the finding's location moved on.
            locationRef: formatLocationRef(finding.location),
          },
          actor: ctx.actor,
        });
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "AI remediation suggestion saved.";
  });
}
