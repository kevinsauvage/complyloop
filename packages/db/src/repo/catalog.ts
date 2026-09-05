import { sql } from "drizzle-orm";
import type { Control, Framework } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "../client.ts";
import { controls, frameworks } from "../schema.ts";
import { controlToRow, frameworkToRow } from "./mappers.ts";

/** Result of merging a shipped adapter catalog into an existing one. */
export interface CatalogMergeResult {
  frameworks: Framework[];
  controls: Control[];
  changed: boolean;
}

/**
 * Merges a shipped adapter catalog into the existing catalog. Injected as a
 * port so `@complyloop/db` stays free of the app's adapter/registry layer.
 */
export type CatalogMerger = (
  existingFrameworks: Framework[],
  existingControls: Control[],
) => CatalogMergeResult;

export async function loadCatalog(
  drizzle: DrizzleDb,
): Promise<{ frameworks: Framework[]; controls: Control[] }> {
  const [frameworkRows, controlRows] = await Promise.all([
    drizzle.select().from(frameworks),
    drizzle.select().from(controls),
  ]);
  return {
    frameworks: frameworkRows.map((row) => row.payload),
    controls: controlRows.map((row) => row.payload),
  };
}

/** Seeds or merges adapter catalog — run on deploy / e2e seed, not per request. */
export async function seedCatalog(
  drizzle: DrizzleDb,
  merge: CatalogMerger,
): Promise<boolean> {
  const existing = await loadCatalog(drizzle);
  const merged =
    existing.frameworks.length === 0
      ? merge([], [])
      : merge(existing.frameworks, existing.controls);
  if (existing.frameworks.length > 0 && !merged.changed) return false;

  if (merged.frameworks.length > 0) {
    await drizzle
      .insert(frameworks)
      .values(merged.frameworks.map(frameworkToRow))
      .onConflictDoUpdate({
        target: frameworks.id,
        set: { payload: sql`excluded.payload` },
      });
  }
  if (merged.controls.length > 0) {
    await drizzle
      .insert(controls)
      .values(merged.controls.map(controlToRow))
      .onConflictDoUpdate({
        target: controls.id,
        set: {
          frameworkId: sql`excluded.framework_id`,
          payload: sql`excluded.payload`,
        },
      });
  }
  return true;
}
