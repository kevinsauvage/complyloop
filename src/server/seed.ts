import { mergeAdapterControls } from "@/adapters/registry";
import type { Db } from "./db";

/** Seeds registered framework adapters on first use and merges new controls. */
export function ensureSeeded(db: Db): boolean {
  if (db.frameworks.length === 0) {
    const merged = mergeAdapterControls([], []);
    db.frameworks.push(...merged.frameworks);
    db.controls.push(...merged.controls);
    return true;
  }

  const merged = mergeAdapterControls(db.frameworks, db.controls);
  if (!merged.changed) return false;
  db.frameworks = merged.frameworks;
  db.controls = merged.controls;
  return true;
}
