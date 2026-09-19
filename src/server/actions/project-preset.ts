"use server";

import { z } from "zod";

import { presetById } from "@complyloop/analysis-core/catalog/registry";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm, requiredField } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { appendEvidence } from "../workspace/project-rows";
import { withProjectWrite } from "../workspace/workspace-write";
import { refresh, requireOnActive } from "./shared";

const setDefaultPresetInput = z.object({
  presetId: requiredField("A framework preset is required."),
});

export async function setDefaultPresetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { presetId } = parseForm(setDefaultPresetInput, formData);
    let changed = false;
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.connect");
      const { project } = workspace;
      const payload: ProjectWritePayload = {};

      const preset = presetById(presetId);
      if (!preset) {
        throw new PublicError(`Unknown framework preset: ${presetId}`);
      }
      if (project.defaultPresetId !== preset.id) {
        project.defaultPresetId = preset.id;
        appendEvidence(payload, {
          kind: "requirements_imported",
          summary: `Default assessment preset set to "${preset.name}" (${preset.controlIds.length} controls)`,
          projectId: project.id,
          detail: { presetId: preset.id, controlIds: preset.controlIds },
        });
        payload.project = project;
        changed = true;
      }
      return payload;
    });
    refresh("/settings", "/requirements", "/evidence");
    return changed
      ? "Default assessment preset saved"
      : "This is already the default preset.";
  });
}
