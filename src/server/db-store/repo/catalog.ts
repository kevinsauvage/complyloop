import { sql } from "drizzle-orm";
import { mergeAdapterControls } from "@/adapters/registry";
import type { Control, Framework } from "@/core/project-types";
import type { DrizzleDb } from "../client";
import { controls, frameworks } from "../schema";
import { controlToRow, frameworkToRow } from "./mappers";

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
export async function seedCatalog(drizzle: DrizzleDb): Promise<boolean> {
  const existing = await loadCatalog(drizzle);
  const merged =
    existing.frameworks.length === 0
      ? mergeAdapterControls([], [])
      : mergeAdapterControls(existing.frameworks, existing.controls);
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
