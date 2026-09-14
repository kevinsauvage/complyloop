import type { Control, Framework } from "@complyloop/analysis-core/contract/project-types";

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
