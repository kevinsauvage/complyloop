import { presetById } from "@complyloop/adapters/registry";
import type { Project } from "@complyloop/domain/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWriteCollector } from "@complyloop/db/project-write";
import { addEvidence, type Db } from "./db";

/**
 * Sets the project's default assessment preset (Settings). Also syncs the
 * in-scope snapshot for stored projects.
 */
export function setDefaultPreset(
  db: Db,
  project: Project,
  presetId: string,
  writes?: ProjectWriteCollector,
): { changed: boolean } {
  const preset = presetById(presetId);
  if (!preset) throw new PublicError(`Unknown framework preset: ${presetId}`);
  if (project.defaultPresetId === preset.id) {
    return { changed: false };
  }

  project.defaultPresetId = preset.id;
  project.inScopeControlIds = [...preset.controlIds];

  const evidenceEntry = {
    kind: "requirements_imported" as const,
    summary: `Default assessment preset set to "${preset.name}" (${preset.controlIds.length} controls)`,
    projectId: project.id,
    detail: { presetId: preset.id, controlIds: preset.controlIds },
  };
  if (writes) {
    writes.addEvidence(evidenceEntry);
    writes.setProject(project);
  } else {
    addEvidence(db, evidenceEntry);
  }
  return { changed: true };
}
