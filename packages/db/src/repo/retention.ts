import { type SQL, sql } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";

/**
 * Retention for the assessment pipeline's own bookkeeping table.
 *
 * `assessments` grows with every run and is never read far back, so it is
 * pruned on the worker tick (`runAssessmentJobBatch`) in bounded batches — a
 * deployment must not stop taking assessments because a DELETE holds a long
 * lock.
 *
 * Guards (each protects something the schema would otherwise destroy):
 *
 * - `findings.assessment_id` is `ON DELETE CASCADE`, so an assessment still
 *   referenced by a finding is never deleted: the finding keeps its provenance
 *   row, and the retention pass leaves that assessment behind.
 * - Only completed assessments are ranked; abandoned rows (never completed)
 *   age out separately so the table stays bounded.
 */
export interface RetentionOptions {
  /** Completed assessments kept per project, newest first. */
  assessmentsPerProject: number;
  /** Never-completed assessments older than this go (abandoned rows). */
  abandonedAssessmentDays: number;
  /** Rows per DELETE, so a big backlog never becomes one long lock. */
  batchSize: number;
  /** DELETEs per table per tick. */
  maxBatches: number;
  /**
   * Restrict the pass to these projects (tests, targeted ops). Omitted = every
   * project, which is what the worker tick does.
   */
  projectIds?: readonly string[];
}

export const RETENTION_DEFAULTS: RetentionOptions = {
  assessmentsPerProject: 30,
  abandonedAssessmentDays: 30,
  batchSize: 1_000,
  maxBatches: 5,
};

export interface RetentionResult {
  assessmentsDeleted: number;
}

/** Deletes `batchSize` rows at a time until a batch comes back short. */
async function deleteInBatches(
  db: DrizzleDb,
  batchSize: number,
  maxBatches: number,
  statement: (limit: number) => Promise<ReadonlyArray<unknown>>,
): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await statement(batchSize);
    deleted += rows.length;
    if (rows.length < batchSize) break;
  }
  return deleted;
}

/** `AND project_id IN (…)`; absent for a global pass, never `IN ()`. */
function scopeClause(
  options: RetentionOptions,
  qualified: string,
): SQL | SQL.Aliased {
  const ids = options.projectIds;
  if (!ids || ids.length === 0) return sql``;
  const column = sql.raw(qualified);
  return sql`AND ${column} IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

export async function prunePipelineRetention(
  db: DrizzleDb,
  options: RetentionOptions = RETENTION_DEFAULTS,
): Promise<RetentionResult> {
  // Ranked per project — a global ranking would delete a low-volume project's
  // newest assessments whenever another project had more runs.
  const assessmentsDeleted = await deleteInBatches(
    db,
    options.batchSize,
    options.maxBatches,
    async (limit) =>
      db.execute(sql`
        DELETE FROM assessments
        WHERE id IN (
          SELECT ranked.id
          FROM (
            SELECT id, project_id,
                   row_number() OVER (
                     PARTITION BY project_id
                     ORDER BY completed_at DESC NULLS LAST,
                              started_at DESC NULLS LAST,
                              id DESC
                   ) AS position
            FROM assessments
            WHERE completed_at IS NOT NULL
          ) ranked
          WHERE ranked.position > ${options.assessmentsPerProject}
            ${scopeClause(options, "ranked.project_id")}
            AND NOT EXISTS (
              SELECT 1 FROM findings
              WHERE findings.project_id = ranked.project_id
                AND findings.assessment_id = ranked.id
            )
          LIMIT ${limit}
        )
        RETURNING id
      `),
  );

  const abandonedDeleted = await deleteInBatches(
    db,
    options.batchSize,
    options.maxBatches,
    async (limit) =>
      db.execute(sql`
        DELETE FROM assessments
        WHERE id IN (
          SELECT a.id FROM assessments a
          WHERE a.completed_at IS NULL
            AND a.started_at < now() - (${options.abandonedAssessmentDays} * interval '1 day')
            ${scopeClause(options, "a.project_id")}
            AND NOT EXISTS (
              SELECT 1 FROM findings
              WHERE findings.project_id = a.project_id
                AND findings.assessment_id = a.id
            )
          LIMIT ${limit}
        )
        RETURNING id
      `),
  );

  return {
    assessmentsDeleted: assessmentsDeleted + abandonedDeleted,
  };
}
