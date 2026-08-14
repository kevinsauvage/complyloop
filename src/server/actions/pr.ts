"use server";

import { publicErrorMessage } from "../action-state";
import { addEvidence } from "../db";
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

  try {
    const tokenOptions = await sessionCheckoutTokenOptions(preview.userId);
    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      tokenOptions,
    );
    await withWorkspaceWrite(({ db }) => {
      const liveFinding = findingById(db, findingId);
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
