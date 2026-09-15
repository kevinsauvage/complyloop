import type {
  Control,
  Framework,
} from "@complyloop/analysis-core/contract/project-types";

import { rgaaControls, rgaaFramework } from "./rgaa/controls.ts";
import { wcagFramework } from "./wcag/controls.ts";

/**
 * Frozen module-level catalog slices. `shippedCatalog` is called on hot render
 * paths (per finding row via report helpers), so it must not copy the controls
 * array on every call.
 */
const SHIPPED_FRAMEWORKS: readonly Framework[] = Object.freeze([
  rgaaFramework,
  wcagFramework,
]);
const SHIPPED_CONTROLS: readonly Control[] = Object.freeze([...rgaaControls]);

const catalogIdSet = new Set(rgaaControls.map((control) => control.id));

/** Fail loud if a preset/tier list names a control the catalog does not have. */
export function catalogControlIds(ids: readonly string[]): readonly string[] {
  const unknown = ids.filter((id) => !catalogIdSet.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown catalog control ids: ${unknown.join(", ")}`);
  }
  return ids;
}

/** Shipped compliance catalog — single source of truth (not stored in Postgres). */
export function shippedCatalog(): {
  frameworks: readonly Framework[];
  controls: readonly Control[];
} {
  return {
    frameworks: SHIPPED_FRAMEWORKS,
    controls: SHIPPED_CONTROLS,
  };
}
