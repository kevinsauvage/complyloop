"use server";

import { generateAiExplanation } from "@/ai/explainer";
import { generateAiRemediation } from "@/ai/remediation";
import { advanceRemediation } from "@/core/remediation";
import { addEvidence } from "../db";
import { reportWarning } from "../observability";
import {
  controlById,
  findingById,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

export async function generateAiExplanationAction(findingId: string): Promise<void> {
  await withWorkspaceWrite(async (workspace) => {
  const { db } = workspace;
  const finding = findingById(db, findingId);
  requireOnFindingProject(workspace, finding, "project.view");
  const control = controlById(db, finding.controlId);

  const explanation = await generateAiExplanation(finding, control);
  if (explanation) {
    finding.explanations.push(explanation);
  } else {
    reportWarning("AI explanation unavailable or failed", {
      code: "ai_explanation_failed",
      findingId,
      projectId: finding.projectId,
    });
  }
  });
  refresh();
}

export async function generateAiRemediationAction(findingId: string): Promise<void> {
  await withWorkspaceWrite(async (workspace) => {
  const { db } = workspace;
  const finding = findingById(db, findingId);
  requireOnFindingProject(workspace, finding, "project.remediate");
  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, findingId);

  if (finding.status !== "open") {
    throw new Error("AI remediation is only available for open findings.");
  }
  if (remediation.status !== "detected" && remediation.status !== "suggested") {
    throw new Error(
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
    refresh();
    return;
  }

  remediation.suggestion = result.suggestion;
  if (
    result.attributeValue &&
    finding.fix?.kind === "insert_attribute" &&
    finding.fix.editable
  ) {
    finding.fix = { ...finding.fix, value: result.attributeValue };
  }

  if (remediation.status === "detected") {
    replaceRemediation(
      db,
      advanceRemediation(
        remediation,
        "suggested",
        `AI suggestion: ${result.suggestion.description}`,
      ),
    );
  } else {
    remediation.history.push({
      status: "suggested",
      at: new Date().toISOString(),
      note: `AI suggestion refreshed: ${result.suggestion.description}`,
    });
  }

  addEvidence(db, {
    kind: "ai_remediation_suggested",
    summary: `AI remediation suggested for ${finding.checkId} at ${finding.location.filePath}:${finding.location.line}`,
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
}

