"use server";

import { z } from "zod";
import { requiredField } from "@/core/boundary";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm } from "../boundary";
import { setDefaultPreset } from "../project-preset";
import { withProjectWrite } from "../workspace-write";
import { refresh, requireOnActive } from "./shared";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

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
    await withProjectWrite({ touch: "project" }, async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { db, project } = workspace;
      const payload: ProjectWritePayload = {};
      changed = setDefaultPreset(db, project, presetId, payload).changed;
      return payload;
    });
    refresh();
    return changed
      ? "Default assessment preset saved"
      : "This is already the default preset.";
  });
}
