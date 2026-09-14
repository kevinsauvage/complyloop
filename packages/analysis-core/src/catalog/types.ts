import type { Explanation } from "../contract/finding-types.ts";

/** Guidance shown for a check — the impact/how-to-fix subset of an {@link Explanation}. */
export type CheckGuidance = Pick<Explanation, "impact" | "howToFix">;

export interface FrameworkPreset {
  id: string;
  name: string;
  description: string;
  frameworkId: string;
  /** Catalog control ids (`ctl-*`). Unknown ids fail at construction via `catalogControlIds`. */
  controlIds: readonly string[];
}

/**
 * Serializable preset projection for client components: everything a preset
 * row renders plus the control count, without the full `controlIds` array that
 * would otherwise ship in the RSC payload.
 */
export type FrameworkPresetSummary = Pick<
  FrameworkPreset,
  "id" | "name" | "description" | "frameworkId"
> & { controlCount: number };
