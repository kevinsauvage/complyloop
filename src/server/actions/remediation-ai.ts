"use server";

import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import { setAiWarn } from "@/ai/ai-call";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { entityIdSchema } from "@/core/boundary";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { refreshSuggestion } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseInput } from "../boundary";
import { reportWarning } from "../observability";
import { assertAiRateLimit } from "../rate-limit";
import {
  controlById,
  remediationForFinding,
} from "../workspace";
import { withFindingWrite } from "../workspace-write";
import { appendEvidence } from "../project-rows";
import {
  refresh,
  replaceRemediation,
} from "./shared";

setAiWarn((message, context) => {
  reportWarning(message, context);
});

export async function generateAiExplanationAction(
  findingIdRaw: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    await withFindingWrite(findingId, "project.view", async ({ workspace, finding }) => {
      if (workspace.userId) await assertAiRateLimit(workspace.userId);
      const control = controlById(finding.controlId);

      const explanation = await generateAiExplanation(finding, control);
      if (!explanation) {
        throw new PublicError(
          "AI explanation unavailable. Check AI credentials or try again.",
        );
      }
      finding.explanations.push(explanation);
      return { findings: [finding] };
    });
    refresh();
    return "AI explanation added.";
  });
}

export async function generateAiRemediationAction(
  findingIdRaw: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    await withFindingWrite(findingId, "project.remediate", async ({ db, finding, workspace }) => {
      if (workspace.userId) await assertAiRateLimit(workspace.userId);
      const control = controlById(finding.controlId);
      const remediation = remediationForFinding(db, findingId);

      if (finding.status !== "open") {
        throw new PublicError("AI remediation is only available for open findings.");
      }
      if (
        remediation.status !== "detected" &&
        remediation.status !== "suggested"
      ) {
        throw new PublicError(
          "AI remediation can only refine suggestions before approval.",
        );
      }

      const result = await generateAiRemediation(finding, control);
      if (!result) {
        throw new PublicError(
          "AI remediation unavailable. Check AI credentials or try again.",
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
        refreshSuggestion(
          remediation,
          result.suggestion,
          remediation.status === "detected"
            ? `AI suggestion: ${result.suggestion.description}`
            : `AI suggestion refreshed: ${result.suggestion.description}`,
        ),
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
        },
      });
      return payload;
    });
    refresh();
    return "AI remediation suggestion saved.";
  });
}
