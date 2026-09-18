import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  Assessment,
  AssessmentSnapshot,
} from "@complyloop/analysis-core/contract/entities";

import type { DrizzleDb } from "../postgres.ts";
import { assessments, assessmentSnapshots } from "../schema.ts";
import { assessmentFromRow, assessmentToRow } from "./mappers.ts";

export async function insertAssessment(
  tx: DrizzleDb,
  assessment: Assessment,
  snapshot: AssessmentSnapshot,
): Promise<void> {
  await tx.insert(assessments).values(assessmentToRow(assessment));
  // Dedup: consecutive runs over an unchanged tree would re-store the full
  // file-hash map every time. When the hashes are identical to the latest
  // stored map, persist the run metadata with an empty map instead —
  // readers fall back to the latest full map (see
  // getLatestAssessmentSnapshot).
  const previous = await getLatestAssessmentSnapshot(tx, assessment.projectId);
  const unchanged =
    previous !== undefined &&
    sameFileHashes(previous.fileHashes, snapshot.fileHashes);
  await tx.insert(assessmentSnapshots).values({
    assessmentId: assessment.id,
    snapshot: unchanged ? { ...snapshot, fileHashes: {} } : snapshot,
    hashesUnchanged: unchanged,
  });
}

/** Canonical form for file-hash map comparison (insertion order varies). */
function sameFileHashes(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/** Full assessment history for many projects (org export only). */
export async function listAssessmentsForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<Assessment[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select()
    .from(assessments)
    .where(inArray(assessments.projectId, [...projectIds]))
    .orderBy(
      desc(sql`${assessments.payload}->>'completedAt'`),
      desc(sql`${assessments.payload}->>'startedAt'`),
    );
  return rows.map((row) => assessmentFromRow(row));
}

/**
 * Latest assessment only (newest-first, length 0 or 1). Webhook pushes append
 * assessment rows without bound; hot-path loads must not read the full
 * history when the app consumes only the latest (P2-3).
 */
export async function listLatestAssessmentForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Assessment[]> {
  const rows = await drizzle
    .select()
    .from(assessments)
    .where(eq(assessments.projectId, projectId))
    .orderBy(
      desc(sql`${assessments.payload}->>'completedAt'`),
      desc(sql`${assessments.payload}->>'startedAt'`),
    )
    .limit(1);
  return rows.map((row) => assessmentFromRow(row));
}

export async function getLatestAssessmentSnapshot(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<AssessmentSnapshot | undefined> {
  const order = [
    desc(sql`${assessments.payload}->>'completedAt'`),
    desc(sql`${assessments.payload}->>'startedAt'`),
  ];
  const [latest] = await drizzle
    .select({
      snapshot: assessmentSnapshots.snapshot,
      hashesUnchanged: assessmentSnapshots.hashesUnchanged,
    })
    .from(assessments)
    .innerJoin(
      assessmentSnapshots,
      eq(assessmentSnapshots.assessmentId, assessments.id),
    )
    .where(eq(assessments.projectId, projectId))
    .orderBy(...order)
    .limit(1);
  if (!latest) return undefined;
  if (!latest.hashesUnchanged) return latest.snapshot;
  // Dedup marker row: resolve the latest full hash map for the project.
  const [full] = await drizzle
    .select({ snapshot: assessmentSnapshots.snapshot })
    .from(assessments)
    .innerJoin(
      assessmentSnapshots,
      eq(assessmentSnapshots.assessmentId, assessments.id),
    )
    .where(
      and(
        eq(assessments.projectId, projectId),
        eq(assessmentSnapshots.hashesUnchanged, false),
      ),
    )
    .orderBy(...order)
    .limit(1);
  if (!full) return latest.snapshot;
  return { ...latest.snapshot, fileHashes: full.snapshot.fileHashes };
}
