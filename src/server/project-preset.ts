import { presetById } from "@/adapters/registry";
import type { Project } from "@complyloop/domain/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { addEvidence, type Db } from "./db";

/**
 * Sets the project's default assessment preset (Settings). Also syncs the
 * in-scope snapshot for stored projects.
 */
export function setDefaultPreset(
  db: Db,
  project: Project,
  presetId: string,
): { changed: boolean } {
  const preset = presetById(presetId);
  if (!preset) throw new PublicError(`Unknown framework preset: ${presetId}`);
  if (project.defaultPresetId === preset.id) {
    return { changed: false };
  }

  project.defaultPresetId = preset.id;
  project.inScopeControlIds = [...preset.controlIds];

  addEvidence(db, {
    kind: "requirements_imported",
    summary: `Default assessment preset set to "${preset.name}" (${preset.controlIds.length} controls)`,
    projectId: project.id,
    detail: { presetId: preset.id, controlIds: preset.controlIds },
  });
  return { changed: true };
}
