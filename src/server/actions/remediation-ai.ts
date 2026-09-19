"use server";

import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import type { ActionState } from "@/core/action-state";
import { refreshSuggestion } from "@/core/remediation-lifecycle";
import { parseEntityId } from "@/core/validate";

import { runAction } from "../action-state";
import { getSession } from "../auth-session";
import { reportError } from "../observability";
import { assertAiRateLimit } from "../rate-limit";
import { appendEvidence } from "../workspace/project-rows";
import {
  controlById,
  remediationForFinding,
  requireFinding,
  requireProjectAccess,
  requireRemediationForFinding,
} from "../workspace/workspace";
import { withFindingWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, replaceRemediation } from "./shared";

export async function generateAiExplanationAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    // The AI call runs BEFORE the write below takes the project lock: holding
    // a lock + open transaction across LLM latency would block every other
    // writer for this project. Preview reads are single-row (finding) + the
    // light project guard — no tenancy load.
    const previewFinding = await requireFinding(findingId);
    // Writes the finding row below: remediate, not view — otherwise a
    // read-only viewer could mutate findings and spend AI credits by invoking
    // the action directly (the UI already gates the button on canRemediate).
    await requireProjectAccess(previewFinding.projectId, "project.remediate");
    const sessionUserId = (await getSession())?.user?.id;
    if (sessionUserId) await assertAiRateLimit(sessionUserId);
    const control = controlById(previewFinding.controlId);

    const explanation = await generateAiExplanation(previewFinding, control, {
      onError: reportError,
    });
    if (!explanation) {
      throw new PublicError(
        "AI explanation unavailable. Check AI credentials or try again.",
      );
    }
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ finding }) => {
        // Persist onto the live row — the preview above may be stale.
        // Cap growth: deterministic baseline (index 0) + latest AI additions.
        // Every append rewrites the whole finding row, so unbounded clicks
        // would bloat it forever.
        const explanations = [...finding.explanations, explanation];
        return {
          findings: [
            {
              ...finding,
              explanations:
                explanations.length > 6
                  ? [explanations[0]!, ...explanations.slice(-5)]
                  : explanations,
            },
          ],
        };
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
    const findingId = parseEntityId(findingIdRaw);
    // The AI call runs BEFORE the write below takes the project lock: holding
    // a lock + open transaction across LLM latency would block every other
    // writer for this project. Preview reads are single-row (finding,
    // remediation) + the light project guard — no tenancy load.
    const previewFinding = await requireFinding(findingId);
    await requireProjectAccess(previewFinding.projectId, "project.remediate");
    const sessionUserId = (await getSession())?.user?.id;
    if (sessionUserId) await assertAiRateLimit(sessionUserId);
    const control = controlById(previewFinding.controlId);
    const previewRemediation = await requireRemediationForFinding(findingId);

    if (previewFinding.status !== "open") {
      throw new PublicError(
        "AI remediation is only available for open findings.",
      );
    }
    if (
      previewRemediation.status !== "detected" &&
      previewRemediation.status !== "suggested"
    ) {
      throw new PublicError(
        "AI remediation can only refine suggestions before approval.",
      );
    }

    const result = await generateAiRemediation(previewFinding, control, {
      onError: reportError,
    });
    if (!result) {
      throw new PublicError(
        "AI remediation unavailable. Check AI credentials or try again.",
      );
    }

    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding }) => {
        // The suggestion verdict was computed from preview data outside the
        // lock. Re-validate the live row before trusting it: the finding must
        // still be open with a pre-approval remediation, otherwise the stale
        // verdict must not decide the write.
        if (finding.status !== "open") {
          throw new PublicError(
            "AI remediation is only available for open findings.",
          );
        }
        const remediation = remediationForFinding(db, findingId);
        if (
          remediation.status !== "detected" &&
          remediation.status !== "suggested"
        ) {
          throw new PublicError(
            "AI remediation can only refine suggestions before approval.",
          );
        }

        const payload: ProjectWritePayload = {};
        if (
          result.attributeValue &&
          finding.fix?.kind === "insert_attribute" &&
          finding.fix.editable
        ) {
          payload.findings = [
            {
              ...finding,
              fix: { ...finding.fix, value: result.attributeValue },
            },
          ];
        }

        replaceRemediation(
          payload,
          refreshSuggestion(remediation, result.suggestion),
        );

        appendEvidence(payload, {
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
        });
        return payload;
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "AI remediation suggestion saved.";
  });
}
