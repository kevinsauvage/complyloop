import { and, count, eq, inArray, sql } from "drizzle-orm";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import {
  FINDING_STATUSES,
  type FindingStatus,
} from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "../postgres.ts";
import { findings } from "../schema.ts";
import { findingToRow } from "./mappers.ts";
import { upsertPayloadRows } from "./upsert-guard.ts";

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
}

export async function listFindingsForProject(
  drizzle: DrizzleDb,
  projectId: string,
  options: ListFindingsOptions = {},
): Promise<Finding[]> {
  const { statuses } = options;
  if (statuses && statuses.length === 0) return [];
  const where =
    statuses && statuses.length > 0
      ? and(
          eq(findings.projectId, projectId),
          inArray(findings.status, [...statuses]),
        )
      : eq(findings.projectId, projectId);
  const rows = await drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(where);
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

export interface UpsertFindingsOptions {
  /**
   * Finding `updatedAt` values captured when the writing slice was loaded.
   * Rows whose DB copy was updated afterward (e.g. a human decision during a
   * webhook assessment) are skipped so a stale apply cannot revert them.
   */
  loadedUpdatedAtById?: ReadonlyMap<string, string>;
}

export async function upsertFindings(
  tx: DrizzleDb,
  items: ReadonlyArray<Finding>,
  options: UpsertFindingsOptions = {},
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
