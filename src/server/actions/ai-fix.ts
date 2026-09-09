"use server";

import { assertSourceLocatedFinding } from "@/ai/verified-fix";
import { aiExplanationAvailable } from "@/ai/explainer";
import { hasSafeDeterministicFix } from "@/core/finding-act";
import { entityIdSchema } from "@/core/boundary";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseInput } from "../boundary";
import { persistPatchCandidate, runAiFixOnCheckout } from "../ai-fix";
import { assertAiRateLimit } from "../rate-limit";
import { withProjectCheckout } from "../repo-checkout";
import {
  controlById,
  getWorkspace,
  requireFinding,
} from "../workspace";
import { withFindingWrite } from "../workspace-write";
import {
  refresh,
  requireOnFindingProject,
} from "./shared";

export async function generateAiFixAction(
  findingIdRaw: string,
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _previous;
  void _formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    requireOnFindingProject(preview, finding, "project.remediate");
    assertSourceLocatedFinding(finding);
    if (finding.status !== "open") {
      throw new PublicError("Patch generation is only available for open findings.");
    }
    const project = preview.projects.find(
      (candidate) => candidate.id === finding.projectId,
    );
    if (!project?.github?.fullName) {
      throw new PublicError(
        "Connect a GitHub repository before generating a patch.",
      );
    }
    if (!hasSafeDeterministicFix(finding) && preview.userId) {
      await assertAiRateLimit(preview.userId);
    }
    const control = controlById(finding.controlId);
    const candidate = await withProjectCheckout(
      project,
      (rootPath) =>
        runAiFixOnCheckout(rootPath, finding, control, {
          aiAvailable: aiExplanationAvailable(),
        }),
    );

    await withFindingWrite(finding.id, "project.remediate", async ({ finding: liveFinding, db }) => {
      const payload: ProjectWritePayload = {};
      persistPatchCandidate(db, liveFinding, candidate, payload);
      return payload;
    });
    refresh();
    return "Patch passed ComplyLoop and is ready for review.";
  });
}
