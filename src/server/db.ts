import { getDrizzle } from "@complyloop/db/client";
import {
  loadProjectAssessmentDb,
  loadWorkspaceDb,
} from "@complyloop/db/workspace-load";
import { WORKSPACE_EVIDENCE_LIMIT } from "@complyloop/db/postgres-scope";
import type { Db } from "@complyloop/db/types";
import { withShippedCatalog } from "./catalog";

export type { Db } from "@complyloop/db/types";
export { emptyDb } from "@complyloop/db/types";
export { addEvidence } from "@complyloop/db/repo/evidence";

/** Loads a single project's assessment slice (no snapshots in assessment list). */
export async function loadProjectDb(projectId: string): Promise<Db> {
  return withShippedCatalog(
    await loadProjectAssessmentDb(await getDrizzle(), projectId),
  );
}

/** Workspace read: active project runtime + org list for switcher. */
export async function loadWorkspaceDbForViewer(input: {
  userId: string | null;
  githubLogin: string | null;
  preferredProjectId?: string | null;
}): Promise<Db> {
  return withShippedCatalog(
    await loadWorkspaceDb(await getDrizzle(), {
      userId: input.userId,
      githubLogin: input.githubLogin,
      activeProjectId: input.preferredProjectId ?? null,
      evidenceLimit: WORKSPACE_EVIDENCE_LIMIT,
    }),
  );
}