"use server";

import { formatLocationRef } from "@/core/location";
import { PublicError } from "@/core/public-error";
import { advanceRemediation } from "@/core/remediation";
import { publicErrorMessage } from "../action-state";
import { addEvidence } from "../db";
import { patchCandidateFromEvidence } from "../ai-fix-result";
import { getDrizzle } from "../db-store/client";
import { listEvidenceForFinding } from "../db-store/postgres-queries";
import { preparePullRequest } from "../pr";
import {
  controlById,
  findingById,
  getWorkspace,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
  sessionCheckoutTokenOptions,
} from "./shared";

export type CreatePrFormState = {
  error: string | null;
  message: string | null;
  prUrl: string | null;
};

export async function createPullRequestAction(
  findingId: string,
  previous: CreatePrFormState,
  formData: FormData,
): Promise<CreatePrFormState> {
  void previous;
  void formData;
  const preview = await getWorkspace();
  const finding = findingById(preview.db, findingId);
  try {
    requireOnFindingProject(preview, finding, "project.remediate");
  } catch (error) {
    return {
      error: publicErrorMessage(error),
      message: null,
      prUrl: null,
    };
  }
  const control = controlById(preview.db, finding.controlId);
  const remediation = remediationForFinding(preview.db, findingId);
  const project = preview.db.projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project) {
    return { error: "Unknown project.", message: null, prUrl: null };
  }
  if (!project.github?.fullName) {
    return {
      error: "Connect a GitHub repository before creating a draft pull request.",
      message: null,
      prUrl: null,
    };
  }

  try {
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
    await withWorkspaceWrite(({ db }) => {
      const liveFinding = findingById(db, findingId);
      const liveRemediation = remediationForFinding(db, findingId);
      if (liveRemediation.status === "suggested") {
        replaceRemediation(
          db,
          advanceRemediation(
            liveRemediation,
            "approved",
            "Approved by creating a draft pull request",
          ),
        );
        addEvidence(db, {
          kind: "remediation_approved",
          summary: `Remediation approved for ${liveFinding.checkId} at ${formatLocationRef(liveFinding.location)}`,
          projectId: project.id,
          controlId: liveFinding.controlId,
          findingId: liveFinding.id,
          detail: { approvalAction: "create_draft_pull_request" },
        });
      }
      addEvidence(db, {
        kind: "pull_request_prepared",
        summary: result.prUrl
          ? `Pull request prepared for ${liveFinding.checkId}: ${result.prUrl}`
          : `Branch ${result.branch} prepared for ${liveFinding.checkId}`,
        projectId: project.id,
        controlId: liveFinding.controlId,
        findingId: liveFinding.id,
        detail: {
          branch: result.branch,
          prUrl: result.prUrl,
          title: result.title,
        },
      });
    });
    refresh();
    return {
      error: null,
      message: result.message,
      prUrl: result.prUrl,
    };
  } catch (error) {
    return {
      error: publicErrorMessage(error),
      message: null,
      prUrl: null,
    };
  }
}
