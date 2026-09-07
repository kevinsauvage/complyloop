import { getDrizzle } from "@complyloop/db/client";
import {
  loadProjectAssessmentDb,
  loadWorkspaceDb,
} from "@complyloop/db/workspace-load";
import type { Db } from "@complyloop/db/types";

export type { Db } from "@complyloop/db/types";

/** Loads a single project's assessment slice (no snapshots in assessment list). */
export async function loadProjectDb(projectId: string): Promise<Db> {
  return loadProjectAssessmentDb(await getDrizzle(), projectId);
}

/** Tenancy + project switcher only — no findings/remediations/evidence window. */
export async function loadWorkspaceTenancyDbForViewer(input: {
  userId: string | null;
  githubLogin: string | null;
  preferredProjectId?: string | null;
}): Promise<Db> {
  return loadWorkspaceDb(await getDrizzle(), {
    userId: input.userId,
    githubLogin: input.githubLogin,
    activeProjectId: input.preferredProjectId ?? null,
    evidenceLimit: 0,
    includeRuntime: false,
  });
}
