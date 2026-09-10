"use server";

import { parseEntityId } from "@/core/filters";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { advanceRemediation } from "@/core/lifecycle";
import {
  runAction,
  type ActionState,
} from "../action-state";
import { patchCandidateFromEvidence } from "../ai-fix";
import { getDrizzle } from "@complyloop/db/postgres";
import { listEvidenceForFinding } from "@complyloop/db/repo/evidence";
import { preparePullRequest } from "../pr";
import { remediationEvidenceDetail, remediationEvidenceSummary } from "../remediation-evidence";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace";
import { withFindingWrite } from "../workspace-write";
import { appendEvidence } from "../project-rows";
import {
  refresh,
  replaceRemediation,
  requireFindingContext,
} from "./shared";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

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
    const { project } = requireFindingContext(preview, finding, "project.remediate");
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
    );
    if (!result.prUrl) {
      throw new PublicError(result.message);
    }
    prUrl = result.prUrl;
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
            detail: remediationEvidenceDetail({ approvalAction: "create_draft_pull_request" }),
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
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return result.message;
  });
  return { ...state, prUrl: state.ok ? prUrl : null };
}
