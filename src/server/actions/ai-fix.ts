"use server";

import { PATCH_PR_SOURCE_ONLY_MESSAGE } from "@/ai/verified-fix";
import { aiExplanationAvailable } from "@/ai/explainer";
import { hasSafeDeterministicFix } from "@/core/finding-act";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import { entityIdSchema } from "@/core/boundary";
import { PublicError } from "@complyloop/db/types";
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
  findingById,
  getWorkspace,
} from "../workspace";
import { withProjectWrite } from "../workspace-write";
import {
  refresh,
  requireOnFindingProject,
  sessionCheckoutTokenOptions,
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
    const finding = findingById(preview.db, findingId);
    requireOnFindingProject(preview, finding, "project.remediate");
    if (!isSourceLocation(finding.location)) {
      throw new PublicError(PATCH_PR_SOURCE_ONLY_MESSAGE);
    }
    if (finding.status !== "open") {
      throw new PublicError("Patch generation is only available for open findings.");
    }
    const project = preview.db.projects.find(
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
    const control = controlById(preview.db, finding.controlId);
    const tokenOptions = await sessionCheckoutTokenOptions();
    const candidate = await withProjectCheckout(
      project,
      (rootPath) =>
        runAiFixOnCheckout(rootPath, finding, control, {
          aiAvailable: aiExplanationAvailable(),
        }),
      undefined,
      tokenOptions,
    );

    await withProjectWrite({ touch: "entities", findingIds: [finding.id] }, async (workspace) => {
      const liveFinding = findingById(workspace.db, finding.id);
      requireOnFindingProject(workspace, liveFinding, "project.remediate");
      const payload: ProjectWritePayload = {};
      persistPatchCandidate(workspace.db, liveFinding, candidate, payload);
      return { result: undefined, payload };
    });
    refresh();
    return "Patch passed ComplyLoop and is ready for review.";
  });
}
