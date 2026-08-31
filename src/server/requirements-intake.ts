import { presetById } from "@/adapters/registry";
import type { Project } from "@/core/project-types";
import { PublicError } from "@/core/public-error";
import { addEvidence, type Db } from "./db";

/**
 * Sets the project's assessment target to a curated framework + level.
 * The previous target is replaced, not stacked.
 */
export function applyFrameworkPreset(
  db: Db,
  project: Project,
  presetId: string,
): { changed: boolean } {
  const preset = presetById(presetId);
  if (!preset) throw new PublicError(`Unknown framework preset: ${presetId}`);
  if (project.assessmentPresetId === preset.id) {
    return { changed: false };
  }

  project.assessmentPresetId = preset.id;
  project.inScopeControlIds = [...preset.controlIds];

  addEvidence(db, {
    kind: "requirements_imported",
    summary: `Assessment target set to "${preset.name}" (${preset.controlIds.length} controls)`,
    projectId: project.id,
    detail: { presetId: preset.id, controlIds: preset.controlIds },
  });
  return { changed: true };
}
