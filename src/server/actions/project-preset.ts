"use server";

import { PublicError } from "@/core/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { setDefaultPreset } from "../project-preset";
import { withProjectWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function setDefaultPresetAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const presetId = formData.get("presetId");
    if (typeof presetId !== "string" || presetId.length === 0) {
      throw new PublicError("A framework preset is required.");
    }
    let changed = false;
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { db, project } = workspace;
      changed = setDefaultPreset(db, project, presetId).changed;
    });
    refresh();
    return changed
      ? "Default assessment preset saved"
      : "This is already the default preset.";
  });
}
