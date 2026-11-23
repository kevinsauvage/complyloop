import { desc, eq, inArray } from "drizzle-orm";

import type { Assessment } from "@complyloop/analysis-core/contract/entities";

import type { DrizzleDb } from "../postgres.ts";
import { assessments } from "../schema.ts";
import { assessmentFromRow, assessmentToRow } from "./mappers.ts";

export async function insertAssessment(
  tx: DrizzleDb,
  assessment: Assessment,
): Promise<void> {
  await tx.insert(assessments).values(assessmentToRow(assessment));
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
    .orderBy(desc(assessments.completedAt), desc(assessments.startedAt));
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
    .orderBy(desc(assessments.completedAt), desc(assessments.startedAt))
    .limit(1);
  return rows.map((row) => assessmentFromRow(row));
}

/**
 * Newest-first assessment history, capped for hot-path reads (trend
 * sparklines). Webhook pushes append rows without bound — callers that only
 * need the latest must use {@link listLatestAssessmentForProject}.
 */
export async function listAssessmentHistoryForProject(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<Assessment[]> {
  const rows = await drizzle
    .select()
    .from(assessments)
    .where(eq(assessments.projectId, projectId))
    .orderBy(desc(assessments.completedAt), desc(assessments.startedAt))
    .limit(limit);
  return rows.map((row) => assessmentFromRow(row));
}
