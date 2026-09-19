import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import {
  FINDING_STATUSES,
  type FindingStatus,
} from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "../postgres.ts";
import { findings } from "../schema.ts";
import { findingToRow } from "./mappers.ts";
import { type StaleWriteOptions, upsertPayloadRows } from "./upsert-guard.ts";

export async function getFindingById(
  drizzle: DrizzleDb,
  findingId: string,
): Promise<Finding | undefined> {
  const rows = await drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(eq(findings.id, findingId))
    .limit(1);
  return rows[0]?.payload;
}

export interface ListFindingsOptions {
  /**
   * Restrict the load to these finding statuses. Omit for all statuses (the
   * write/assessment/report paths that need full history). An empty array
   * loads no findings for callers that only need the rest of the runtime.
   */
  statuses?: readonly FindingStatus[];
  /**
   * Hard cap on rows (page reads). Always paired with the severity-first
   * `ORDER BY` below, so truncation drops the least severe findings first
   * and loads stay deterministic. Omit for full history (writes, reports,
   * exports). Callers compare against `countFindingsByStatusForProject` and
   * surface truncation instead of silently paging a partial set.
   */
  limit?: number;
}

/**
 * Max finding rows a page read loads. Payloads are ~1KB, so a full capped
 * load stays in single-digit MB; above the cap the findings page shows a
 * refine-filters notice (counts stay exact via the SQL count).
 */
export const FINDINGS_LIST_LOAD_LIMIT = 5_000;

export async function listFindingsForProject(
  drizzle: DrizzleDb,
  projectId: string,
  options: ListFindingsOptions = {},
): Promise<Finding[]> {
  const { statuses, limit } = options;
  if (statuses && statuses.length === 0) return [];
  const where =
    statuses && statuses.length > 0
      ? and(
          eq(findings.projectId, projectId),
          inArray(findings.status, [...statuses]),
        )
      : eq(findings.projectId, projectId);
  // Severity-first, id tiebreak — same order as the JS fallback sort
  // (`compareFindingsBySeverity`), so capped and full loads agree. Served by
  // `findings_project_status_severity_idx`.
  const query = drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(where)
    .orderBy(asc(findings.severityRank), asc(findings.id));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map((row) => row.payload);
}

/**
 * Full-history findings for many projects in one query (org export), instead
 * of one `listFindingsForProject` per project.
 */
export async function listFindingsForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<Finding[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(inArray(findings.projectId, [...projectIds]));
  return rows.map((row) => row.payload);
}

/**
 * Status counts for a project. Served by `findings_project_status_idx`, so the
 * findings page can render tab totals without loading history rows.
 */
export async function countFindingsByStatusForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Record<FindingStatus, number>> {
  const rows = await drizzle
    .select({ status: findings.status, value: count() })
    .from(findings)
    .where(eq(findings.projectId, projectId))
    .groupBy(findings.status);
  const counts = Object.fromEntries(
    FINDING_STATUSES.map((status) => [status, 0]),
  ) as Record<FindingStatus, number>;
  for (const row of rows) {
    if ((FINDING_STATUSES as readonly string[]).includes(row.status)) {
      counts[row.status as FindingStatus] = Number(row.value ?? 0);
    }
  }
  return counts;
}

/**
 * Open finding counts per control for a project (requirements page badges).
 * Lets the requirements view stay exact when the findings row load is capped:
 * counts come from SQL, not the loaded slice. Filter served by the leftmost
 * `findings_project_status_idx` prefix.
 */
export async function countOpenFindingsByControlForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await drizzle
    .select({ controlId: findings.controlId, value: count() })
    .from(findings)
    .where(and(eq(findings.projectId, projectId), eq(findings.status, "open")))
    .groupBy(findings.controlId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.controlId, Number(row.value ?? 0));
  }
  return counts;
}

export async function upsertFindings(
  tx: DrizzleDb,
  items: ReadonlyArray<Finding>,
  options: StaleWriteOptions = {},
): Promise<void> {
  await upsertPayloadRows(
    items,
    options.loadedUpdatedAtById,
    async (ids) => {
      const rows = await tx
        .select({ id: findings.id, payload: findings.payload })
        .from(findings)
        .where(inArray(findings.id, [...ids]));
      return new Map(rows.map((row) => [row.id, row.payload.updatedAt]));
    },
    findingToRow,
    async (rows) => {
      await tx
        .insert(findings)
        .values(rows)
        .onConflictDoUpdate({
          target: findings.id,
          set: {
            projectId: sql`excluded.project_id`,
            controlId: sql`excluded.control_id`,
            assessmentId: sql`excluded.assessment_id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        });
    },
  );
}
