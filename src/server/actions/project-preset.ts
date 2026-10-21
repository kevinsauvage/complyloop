"use server";

import { z } from "zod";

import { presetById } from "@complyloop/analysis-core/catalog/registry";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import { updateProject } from "@complyloop/db/repo/projects";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { withProjectTx } from "../workspace/workspace-write";
import { refresh } from "./shared";

const setDefaultPresetInput = z.object({
  projectId: requiredField("Unknown project."),
  presetId: requiredField("A framework preset is required."),
});

export async function setDefaultPresetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { projectId, presetId } = parseForm(setDefaultPresetInput, formData);
    const preset = presetById(presetId);
    if (!preset) {
      throw new PublicError(`Unknown framework preset: ${presetId}`);
    }

    const changed = await withProjectTx(
      projectId,
      "project.connect",
      async ({ tx, project, actor }) => {
        if (project.defaultPresetId === preset.id) return false;
        await updateProject(tx, { ...project, defaultPresetId: preset.id });
        await insertEvidence(tx, {
          kind: "requirements_imported",
          summary: `Default assessment preset set to "${preset.name}" (${preset.controlIds.length} controls)`,
          projectId: project.id,
          detail: { presetId: preset.id, controlIds: preset.controlIds },
          actor,
        });
        return true;
      },
    );
    refresh(
      "/projects/[projectId]/settings",
      "/projects/[projectId]/requirements",
      "/projects/[projectId]/evidence",
    );
    return changed
      ? "Default assessment preset saved"
      : "This is already the default preset.";
  });
}
