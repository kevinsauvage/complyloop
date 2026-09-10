import "server-only";
import { getDrizzle } from "@complyloop/db/postgres";
import { loadProjectAssessmentDb } from "@complyloop/db/workspace-load";
import type { Db } from "@complyloop/db/types";

/** Loads a single project's assessment slice (no snapshots in assessment list). */
export async function loadProjectDb(projectId: string): Promise<Db> {
  return loadProjectAssessmentDb(await getDrizzle(), projectId);
}
