"use server";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { advanceRemediation } from "@/core/remediation-lifecycle";
import { parseEntityId } from "@/core/validate";

import { type ActionState, runAction } from "../action-state";
import { patchCandidateFromEvidence } from "../assessment/ai-fix";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import { createProjectPullRequest } from "../github/github-connector";
import { listEvidenceForFindingScoped } from "../reporting/evidence-queries";
import { appendEvidence } from "../workspace/project-rows";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace/workspace";
import { withFindingWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, replaceRemediation, requireFindingContext } from "./shared";

export type CreatePrFormState = ActionState & {
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
  const state = await runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    const { project } = requireFindingContext(
      preview,
      finding,
      "project.remediate",
    );
    const control = controlById(finding.controlId);
    const remediation = await requireRemediationForFinding(findingId);
    if (!project) {
      throw new PublicError("Unknown project.");
    }
    if (!project.github?.fullName) {
      throw new PublicError(
        "Connect a GitHub repository before creating a draft pull request.",
      );
    }

    const evidence = await listEvidenceForFindingScoped(findingId);
    const candidate = patchCandidateFromEvidence([...evidence].reverse());
    if (!candidate) {
      throw new PublicError(
        "Generate and review a ComplyLoop-verified patch before creating a draft pull request.",
      );
    }
    const result = await createProjectPullRequest(
      project,
      control,
      finding,
      remediation,
      candidate,
    );
    if (!result.prUrl) {
      throw new PublicError(result.message);
    }
    prUrl = result.prUrl;
    try {
      await withFindingWrite(
        findingId,
        "project.remediate",
        async ({ db, finding: liveFinding }) => {
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
              summary: remediationEvidenceSummary("approved", liveFinding),
              projectId: project.id,
              controlId: liveFinding.controlId,
              findingId: liveFinding.id,
              detail: remediationEvidenceDetail({
                approvalAction: "create_draft_pull_request",
              }),
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
        },
      );
    } catch (error) {
      // The draft PR already exists on GitHub. Surface the URL so the write
      // can be retried — prepare force-pushes to the same branch and reuses
      // the open PR instead of opening a second one.
      throw new PublicError(
        `Draft pull request ${result.prUrl} was created on branch \`${result.branch}\` but the database write failed (${error instanceof Error ? error.message : "unknown error"}). Retry — the existing branch and PR will be reused.`,
      );
    }
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return result.message;
  });
  return { ...state, prUrl };
}
