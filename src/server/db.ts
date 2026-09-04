import type { EvidenceRecord } from "@/core/finding-types";
import { getDrizzle } from "./db-store/client";
import { newEvidenceRecord } from "./db-store/repo/mappers";
import {
  loadProjectAssessmentDb,
  loadWorkspaceDb,
} from "./db-store/workspace-load";
import { WORKSPACE_EVIDENCE_LIMIT } from "./db-store/postgres-scope";
import type { Db } from "./db-store/types";

export type { Db } from "./db-store/types";
export { emptyDb } from "./db-store/types";

/** Loads a single project's assessment slice (no snapshots in assessment list). */
export async function loadProjectDb(projectId: string): Promise<Db> {
  return loadProjectAssessmentDb(await getDrizzle(), projectId);
}

/** Workspace read: active project runtime + org list for switcher. */
export async function loadWorkspaceDbForViewer(input: {
  userId: string | null;
  githubLogin: string | null;
  preferredProjectId?: string | null;
}): Promise<Db> {
  return loadWorkspaceDb(await getDrizzle(), {
    userId: input.userId,
    githubLogin: input.githubLogin,
    activeProjectId: input.preferredProjectId ?? null,
    evidenceLimit: WORKSPACE_EVIDENCE_LIMIT,
  });
}

/** Evidence is append-only: records are queued in memory then inserted via repo. */
export function addEvidence(
  db: Db,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  db.evidence.push(record);
  return record;
}
