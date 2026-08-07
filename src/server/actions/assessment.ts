"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { runAssessment } from "../assessment";
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
      await runAssessment(workspace.db, workspace.project.id);
    });
    refresh();
    return "Assessment complete.";
  });
}
