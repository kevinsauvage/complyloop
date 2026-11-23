"use server";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getFindingById } from "@complyloop/db/repo/findings";

import { AI_PATCH_UNAVAILABLE_MESSAGE } from "@/ai/ai-call";
import { assertSourceLocatedFinding } from "@/ai/verified-fix";
import type { ActionState } from "@/core/actions/action-state";
import { parseEntityId } from "@/core/actions/validate";
import { hasSafeDeterministicFix } from "@/core/requirements/remediation-lifecycle";

import { runAction } from "../action-state";
import { prepareAiCallForOrg } from "../ai/ai-config";
import {
  generatePatchCandidateForFinding,
  persistPatchCandidate,
} from "../assessment/ai-fix";
import { getSession } from "../auth-session";
import { assertAiOrgRateLimit, assertAiRateLimit } from "../rate-limit";
import {
  controlById,
  requireFinding,
  requireProjectAccess,
} from "../workspace/workspace";
import { withProjectTx } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

export async function generateAiFixAction(
  findingIdRaw: string,
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previous;
  void _formData;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    // Light preview reads (single finding row + project guard) instead of the
    // full tenancy load: checkout + AI run outside the write transaction below.
    const finding = await requireFinding(findingId);
    const project = await requireProjectAccess(
      finding.projectId,
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
    // Rate-limit before any GitHub I/O: even a deterministic fix reads the
    // file and re-scans it through `generatePatchCandidateForFinding`.
    const sessionUserId = (await getSession())?.user?.id;
    if (sessionUserId) await assertAiRateLimit(sessionUserId);
    await assertAiOrgRateLimit(project.orgId);
    const control = controlById(finding.controlId);
    // Deterministic fixes must keep working without AI; only the AI path
    // resolves credentials.
    const needsAi = !hasSafeDeterministicFix(finding);
    const config = needsAi
      ? await prepareAiCallForOrg(project.orgId, AI_PATCH_UNAVAILABLE_MESSAGE)
      : null;
    // File read + AI + re-verify run outside any write lock (see P2-8 /
    // remediation-verify.ts); the transaction below only persists the candidate.
    const candidate = await generatePatchCandidateForFinding(
      project,
      finding,
      control,
      { aiConfig: config },
    );

    await withProjectTx(finding.projectId, "project.remediate", async (ctx) => {
      const live = await getFindingById(ctx.tx, finding.id);
      if (!live) throw new PublicError("Unknown finding.");
      await persistPatchCandidate(ctx.tx, live, candidate, ctx.actor);
    });
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Patch passed ComplyLoop and is ready for review.";
  });
}
