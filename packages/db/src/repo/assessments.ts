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
