import { presetById } from "@complyloop/adapters/registry";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";
import type { Db } from "./db";
import { appendEvidence } from "./project-rows";

/** Sets the project's default assessment preset (Settings). */
export function setDefaultPreset(
  db: Db,
  project: Project,
  presetId: string,
  payload?: ProjectWritePayload,
): { changed: boolean } {
  const preset = presetById(presetId);
  if (!preset) throw new PublicError(`Unknown framework preset: ${presetId}`);
  if (project.defaultPresetId === preset.id) {
    return { changed: false };
  }

  project.defaultPresetId = preset.id;

  const entry = {
    kind: "requirements_imported" as const,
    summary: `Default assessment preset set to "${preset.name}" (${preset.controlIds.length} controls)`,
    projectId: project.id,
    detail: { presetId: preset.id, controlIds: preset.controlIds },
  };
  if (payload) {
    appendEvidence(payload, entry);
    payload.project = project;
  } else {
    db.evidence.push(newEvidenceRecord(entry));
  }
  return { changed: true };
}
