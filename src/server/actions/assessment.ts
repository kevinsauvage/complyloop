"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { runAssessment } from "../assessment";
import { assertAssessRateLimit } from "../rate-limit";
import { withProjectCheckout } from "../repo-checkout";
import { getWorkspace, withWorkspaceWrite } from "../workspace";
import {
  refresh,
  requireOnActive,
  sessionCheckoutTokenOptions,
} from "./shared";

export async function runAssessmentAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    const preview = await getWorkspace();
    requireOnActive(preview, "project.assess");
    if (preview.userId) assertAssessRateLimit(preview.userId);
    const project = preview.project;
    const tokenOptions = await sessionCheckoutTokenOptions(preview.userId);

    await withProjectCheckout(
      project,
      async (rootPath) => {
        await withWorkspaceWrite(async (workspace) => {
          requireOnActive(workspace, "project.assess");
          await runAssessment(workspace.db, workspace.project.id, {
            rootPath,
          });
        });
      },
      undefined,
      tokenOptions,
    );
    refresh();
    return "Assessment complete.";
  });
}
