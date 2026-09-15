import { desc, eq, inArray, sql } from "drizzle-orm";

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
  await tx.insert(assessmentSnapshots).values({
    assessmentId: assessment.id,
    snapshot,
  });
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
  const rows = await drizzle
    .select({ snapshot: assessmentSnapshots.snapshot })
    .from(assessments)
    .innerJoin(
      assessmentSnapshots,
      eq(assessmentSnapshots.assessmentId, assessments.id),
    )
    .where(eq(assessments.projectId, projectId))
    .orderBy(
      desc(sql`${assessments.payload}->>'completedAt'`),
      desc(sql`${assessments.payload}->>'startedAt'`),
    )
    .limit(1);
  return rows[0]?.snapshot;
}
