"use server";

import { z } from "zod";
import { requiredField } from "@/core/boundary";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { setDefaultPreset } from "../project-preset";
import { withProjectWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

const setDefaultPresetInput = z.object({
  presetId: requiredField("A framework preset is required."),
});

export async function setDefaultPresetAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { presetId } = parseForm(setDefaultPresetInput, formData);
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
