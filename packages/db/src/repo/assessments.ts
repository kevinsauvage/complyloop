import { desc, eq, sql } from "drizzle-orm";
import type { Assessment, AssessmentSnapshot } from "@complyloop/analysis-core/contract/finding-types";
import type { DrizzleDb } from "../client.ts";
import { assessmentSnapshots, assessments } from "../schema.ts";
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

/** Full history — reserve for surfaces that render it (org export). */
export async function listAssessmentsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Assessment[]> {
  const rows = await drizzle
    .select()
    .from(assessments)
    .where(eq(assessments.projectId, projectId))
    .orderBy(desc(sql`${assessments.payload}->>'completedAt'`));
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
    .orderBy(desc(sql`${assessments.payload}->>'completedAt'`))
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
    .orderBy(desc(sql`${assessments.payload}->>'completedAt'`))
    .limit(1);
  return rows[0]?.snapshot;
}
