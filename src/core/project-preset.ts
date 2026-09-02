import { DEFAULT_CONNECT_PRESET_ID, presetById } from "@/adapters/registry";
import type { Project } from "./project-types";

/** Project default assessment preset; falls back through legacy fields. */
export function projectDefaultPresetId(project: Project): string {
  const candidate = project.defaultPresetId ?? project.assessmentPresetId;
  if (candidate && presetById(candidate)) return candidate;
  return DEFAULT_CONNECT_PRESET_ID;
}
