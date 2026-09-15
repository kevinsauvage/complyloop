import "server-only";

import {
  acquireNamedPostgresAdvisoryLock,
  type DrizzleDb,
  getDrizzle,
  projectWriteLockKey,
} from "@complyloop/db/postgres";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { loadProjectAssessmentDb } from "@complyloop/db/workspace-load";

/** Loads a single project's assessment slice (no snapshots in assessment list). */
export async function loadProjectDb(
  projectId: string,
): Promise<WorkspaceSlice> {
  return loadProjectAssessmentDb(await getDrizzle(), projectId);
}

/** Serializes a single-row project mutation (e.g. mark alert read). */
export async function withProjectLock<T>(
  projectId: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
    return fn(tx);
  });
}
