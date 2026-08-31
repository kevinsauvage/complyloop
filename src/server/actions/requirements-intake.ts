"use server";

import { PublicError } from "@/core/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { applyFrameworkPreset } from "../requirements-intake";
import { withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function applyFrameworkPresetAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const presetId = formData.get("presetId");
    if (typeof presetId !== "string" || presetId.length === 0) {
      throw new PublicError("A framework preset is required.");
    }
    let changed = false;
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      changed = applyFrameworkPreset(db, project, presetId).changed;
    });
    refresh();
    return changed
      ? "Assessment target updated."
      : "This is already the assessment target.";
  });
}
