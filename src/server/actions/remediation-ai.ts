"use server";

import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import { setAiWarn } from "@/ai/warn";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { entityIdSchema } from "@/core/boundary";
import { PublicError } from "@complyloop/db/types";
import { advanceRemediation } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseInput } from "../boundary";
import { reportWarning } from "../observability";
import { assertAiRateLimit } from "../rate-limit";
import {
  controlById,
  findingById,
  remediationForFinding,
  withProjectWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
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
    await withProjectWrite({ touch: "entities", findingIds: [findingId] }, async (workspace, writes) => {
      if (workspace.userId) await assertAiRateLimit(workspace.userId);
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.view");
      const control = controlById(db, finding.controlId);

      const explanation = await generateAiExplanation(finding, control);
      if (!explanation) {
        reportWarning("AI explanation unavailable or failed", {
          code: "ai_explanation_failed",
          findingId,
          projectId: finding.projectId,
        });
        throw new PublicError(
          "AI explanation unavailable. Check AI credentials or try again.",
        );
      }
      finding.explanations.push(explanation);
      writes.upsertFinding(finding);
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
    await withProjectWrite({ touch: "entities", findingIds: [findingId] }, async (workspace, writes) => {
      if (workspace.userId) await assertAiRateLimit(workspace.userId);
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const control = controlById(db, finding.controlId);
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
        reportWarning("AI remediation unavailable or failed", {
          code: "ai_remediation_failed",
          findingId,
          projectId: finding.projectId,
        });
        throw new PublicError(
          "AI remediation unavailable. Check AI credentials or try again.",
        );
      }

      remediation.suggestion = result.suggestion;
      if (
        result.attributeValue &&
        finding.fix?.kind === "insert_attribute" &&
        finding.fix.editable
      ) {
        finding.fix = { ...finding.fix, value: result.attributeValue };
        writes.upsertFinding(finding);
      }

      if (remediation.status === "detected") {
        replaceRemediation(
          db,
          advanceRemediation(
            remediation,
            "suggested",
            `AI suggestion: ${result.suggestion.description}`,
          ),
          writes,
        );
      } else {
        remediation.history.push({
          status: "suggested",
          at: new Date().toISOString(),
          note: `AI suggestion refreshed: ${result.suggestion.description}`,
        });
        writes.upsertRemediation(remediation);
      }

      writes.addEvidence({
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
    });
    refresh();
    return "AI remediation suggestion saved.";
  });
}
