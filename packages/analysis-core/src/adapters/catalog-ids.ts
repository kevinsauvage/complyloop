import { rgaaControls } from "./rgaa/controls.ts";

const catalogIdSet = new Set(rgaaControls.map((control) => control.id));

/** Fail loud if a preset/tier list names a control the catalog does not have. */
export function catalogControlIds(ids: readonly string[]): readonly string[] {
  const unknown = ids.filter((id) => !catalogIdSet.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown catalog control ids: ${unknown.join(", ")}`);
  }
  return ids;
}
