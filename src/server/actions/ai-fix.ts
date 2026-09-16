"use server";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { aiAvailable } from "@/ai/ai-call";
import { assertSourceLocatedFinding } from "@/ai/verified-fix";
import { hasSafeDeterministicFix } from "@/core/remediation-lifecycle";
import { parseEntityId } from "@/core/validate";

import { type ActionState, runAction } from "../action-state";
import {
  generatePatchCandidateOnCheckout,
  persistPatchCandidate,
} from "../assessment/ai-fix";
import { assertAiRateLimit } from "../rate-limit";
import {
  controlById,
  getWorkspace,
  requireFinding,
} from "../workspace/workspace";
import { withFindingWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, requireFindingContext } from "./shared";

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
    const { project } = requireFindingContext(
      preview,
      finding,
      "project.remediate",
    );
    assertSourceLocatedFinding(finding);
    if (finding.status !== "open") {
      throw new PublicError(
        "Patch generation is only available for open findings.",
      );
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
    // Checkout + AI + re-verify run outside any write lock (see P2-8 /
    // remediation-verify.ts); the write below only persists the candidate.
    const candidate = await generatePatchCandidateOnCheckout(
      project,
      finding,
      control,
      { aiAvailable: aiAvailable() },
    );

    await withFindingWrite(
      finding.id,
      "project.remediate",
      async ({ finding: liveFinding, db }) => {
        const payload: ProjectWritePayload = {};
        persistPatchCandidate(db, liveFinding, candidate, payload);
        return payload;
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Patch passed ComplyLoop and is ready for review.";
  });
}
