import { rgaaControls, rgaaFramework } from "./rgaa/controls.ts";
import { wcagFramework } from "./wcag/controls.ts";
import type { Control, Framework } from "@complyloop/domain/project-types";

/** Shipped compliance catalog — single source of truth (not stored in Postgres). */
export function shippedCatalog(): {
  frameworks: Framework[];
  controls: Control[];
} {
  return {
    frameworks: [rgaaFramework, wcagFramework],
    controls: [...rgaaControls],
  };
}
