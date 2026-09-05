import type { CheckId } from "@complyloop/analysis-core/types";
import type { Control, Framework } from "@complyloop/domain/project-types";

export interface CheckGuidance {
  impact: string;
  howToFix: string;
}

export interface FrameworkPreset {
  id: string;
  name: string;
  description: string;
  frameworkId: string;
  /** Catalog control ids (`ctl-*`). Unknown ids fail at construction via `catalogControlIds`. */
  controlIds: readonly string[];
}

/**
 * A compliance framework packaged as presets (and optionally a unique control
 * catalog). RGAA owns the shared a11y catalog; WCAG registers framework +
 * presets only. Add new frameworks under `src/adapters/<name>/` and register
 * them in `registry.ts`.
 */
export interface FrameworkAdapter {
  framework: Framework;
  /** Unique catalog rows. Empty when this adapter reuses another catalog. */
  controls: readonly Control[];
  presets?: readonly FrameworkPreset[];
  guidanceFor?: (checkId: CheckId) => CheckGuidance;
}
