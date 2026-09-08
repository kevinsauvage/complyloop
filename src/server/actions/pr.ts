"use server";

import { entityIdSchema } from "@/core/boundary";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { advanceRemediation } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseInput } from "../boundary";
import { patchCandidateFromEvidence } from "../ai-fix";
import { getDrizzle } from "@complyloop/db/client";
import { listEvidenceForFinding } from "@complyloop/db/repo/evidence";
import { preparePullRequest } from "../pr";
import {
  controlById,
  findingById,
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace";
import { withProjectWrite } from "../workspace-write";
import { appendEvidence } from "../project-rows";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
  sessionCheckoutTokenOptions,
} from "./shared";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

export type CreatePrFormState = ActionMessageState & {
  prUrl: string | null;
};

export async function createPullRequestAction(
  findingIdRaw: string,
  previous: CreatePrFormState,
  formData: FormData,
): Promise<CreatePrFormState> {
  void previous;
  void formData;
  let prUrl: string | null = null;
  const state = await runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    requireOnFindingProject(preview, finding, "project.remediate");
    const control = controlById(finding.controlId);
    const remediation = await requireRemediationForFinding(findingId);
    const project = preview.projects.find(
      (candidate) => candidate.id === finding.projectId,
    );
    if (!project) {
      throw new PublicError("Unknown project.");
    }
    if (!project.github?.fullName) {
      throw new PublicError(
        "Connect a GitHub repository before creating a draft pull request.",
      );
    }

    const tokenOptions = await sessionCheckoutTokenOptions();
    const evidence = await listEvidenceForFinding(
      await getDrizzle(),
      findingId,
    );
    const candidate = patchCandidateFromEvidence([...evidence].reverse());
    if (!candidate) {
      throw new PublicError(
        "Generate and review a ComplyLoop-verified patch before creating a draft pull request.",
      );
    }
    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      candidate,
      tokenOptions,
    );
    if (!result.prUrl) {
      throw new PublicError(result.message);
    }
    prUrl = result.prUrl;
    await withProjectWrite({ touch: "entities", findingIds: [findingId] }, async ({ db }) => {
      const liveFinding = findingById(db, findingId);
      const liveRemediation = remediationForFinding(db, findingId);
      const payload: ProjectWritePayload = {};
      if (liveRemediation.status === "suggested") {
        replaceRemediation(payload, {
          ...advanceRemediation(
            liveRemediation,
            "approved",
            "Approved by creating a draft pull request",
          ),
          approvalAction: "create_draft_pull_request",
        });
        appendEvidence(payload, {
          kind: "remediation_approved",
          summary: `Remediation approved for ${liveFinding.checkId} at ${formatLocationRef(liveFinding.location)}`,
          projectId: project.id,
          controlId: liveFinding.controlId,
          findingId: liveFinding.id,
          detail: { approvalAction: "create_draft_pull_request" },
        });
      }
      appendEvidence(payload, {
        kind: "pull_request_prepared",
        summary: `Pull request prepared for ${liveFinding.checkId}: ${result.prUrl}`,
        projectId: project.id,
        controlId: liveFinding.controlId,
        findingId: liveFinding.id,
        detail: {
          branch: result.branch,
          prUrl: result.prUrl,
          title: result.title,
        },
      });
      return payload;
    });
    refresh();
    return result.message;
  });
  return { ...state, prUrl: state.error ? null : prUrl };
}
