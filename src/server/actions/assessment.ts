"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { runAssessment } from "../assessment";
import { addEvidence } from "../db";
import { resetSampleWorkspace } from "../seed";
import { withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function runAssessmentAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      runAssessment(workspace.db, workspace.project.id);
    });
    refresh();
    return "Assessment complete.";
  });
}

export async function resetProjectAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.remediate");
      const { db, project } = workspace;
      if (project.source !== "sample") {
        throw new Error("Only the sample project can be reset.");
      }
      resetSampleWorkspace(project);
      addEvidence(db, {
        kind: "project_reset",
        summary: `Workspace of "${project.name}" restored to its original state`,
        projectId: project.id,
      });
    });
    refresh();
    return "Sample project reset.";
  });
}
