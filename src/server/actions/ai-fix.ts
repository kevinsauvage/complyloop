"use server";

import { assertSourceLocatedFinding } from "@/ai/verified-fix";
import { aiAvailable } from "@/ai/ai-call";
import { hasSafeDeterministicFix } from "@/core/lifecycle";
import { parseEntityId } from "@/core/filters";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import {
  runAction,
  type ActionState,
} from "../action-state";
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
  requireFindingContext,
} from "./shared";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";

export async function generateAiFixAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    const { project } = requireFindingContext(preview, finding, "project.remediate");
    assertSourceLocatedFinding(finding);
    if (finding.status !== "open") {
      throw new PublicError("Patch generation is only available for open findings.");
    }
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
          aiAvailable: aiAvailable(),
        }),
    );

    await withFindingWrite(finding.id, "project.remediate", async ({ finding: liveFinding, db }) => {
      const payload: ProjectWritePayload = {};
      persistPatchCandidate(db, liveFinding, candidate, payload);
      return payload;
    });
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Patch passed ComplyLoop and is ready for review.";
  });
}
