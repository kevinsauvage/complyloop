import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  type SQL,
  sql,
} from "drizzle-orm";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { AssessmentEngine } from "@complyloop/analysis-core/contract/finding-types";
import { DEFAULT_PAGE_SIZE } from "@complyloop/analysis-core/contract/project-types";
import {
  FINDING_STATUSES,
  type FindingStatus,
  type RemediationStatus,
  type Severity,
  SEVERITY_RANK,
} from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "../postgres.ts";
import { findings, remediations } from "../schema.ts";
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

export interface FindingsPageFilters {
  statuses?: readonly FindingStatus[];
  severity?: Severity;
  controlId?: string;
  /** Restrict to these controls (project preset scope). */
  controlIds?: readonly string[];
  engine?: AssessmentEngine;
  remediation?: RemediationStatus;
}

/** Shared WHERE clause for the paginated list and its total (must match). */
function findingsPageWhere(
  projectId: string,
  filters: FindingsPageFilters = {},
): SQL | undefined {
  const conditions = [eq(findings.projectId, projectId)];
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(findings.status, [...filters.statuses]));
  }
  if (filters.controlIds) {
    conditions.push(inArray(findings.controlId, [...filters.controlIds]));
  }
  if (filters.severity) {
    conditions.push(eq(findings.severityRank, SEVERITY_RANK[filters.severity]));
  }
  if (filters.controlId) {
    conditions.push(eq(findings.controlId, filters.controlId));
  }
  if (filters.engine) {
    conditions.push(eq(findings.engine, filters.engine));
  }
  if (filters.remediation) {
    // EXISTS (not a join) so duplicate remediation rows can never multiply
    // list rows or inflate the total.
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${remediations} WHERE ${remediations.findingId} = ${findings.id} AND ${remediations.status} = ${filters.remediation})`,
    );
  }
  return and(...conditions);
}

/**
 * Ordered finding ids for one tab under the SQL-expressible filters — the
 * finding page's prev/next queue. Ids only: the queue needs position and
 * neighbours, never the row payloads the list used to load wholesale.
 */
export async function listFindingIdsForQueue(
  drizzle: DrizzleDb,
  projectId: string,
  filters: FindingsPageFilters = {},
): Promise<string[]> {
  const rows = await drizzle
    .select({ id: findings.id })
    .from(findings)
    .where(findingsPageWhere(projectId, filters))
    .orderBy(asc(findings.severityRank), asc(findings.id));
  return rows.map((row) => row.id);
}

export interface FindingsPageOptions extends FindingsPageFilters {
  page?: number;
  pageSize?: number;
}

export interface FindingsPage {
  rows: Finding[];
  total: number;
}

/**
 * One findings-list page with its exact total, both in SQL. Order is
 * severity-first with id tiebreak — identical to the JS fallback sort
 * (`compareFindingsBySeverity`), so SQL pages and JS pages never disagree.
 * Only free-text search needs the bounded full load; every other filter is
 * SQL-expressible.
 */
export async function listFindingsPageForProject(
  drizzle: DrizzleDb,
  projectId: string,
  options: FindingsPageOptions = {},
): Promise<FindingsPage> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, ...filters } = options;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const where = findingsPageWhere(projectId, filters);
  const [countRows, rows] = await Promise.all([
    drizzle.select({ value: count() }).from(findings).where(where),
    drizzle
      .select({ payload: findings.payload })
      .from(findings)
      .where(where)
      .orderBy(asc(findings.severityRank), asc(findings.id))
      .limit(pageSize)
      .offset((safePage - 1) * pageSize),
  ]);
  return {
    rows: rows.map((row) => row.payload),
    total: Number(countRows[0]?.value ?? 0),
  };
}

/**
 * Per-status totals under the SQL-expressible filters (severity/control/engine/remediation).
 * One grouped query for all tab badges, so the fast path never loads rows
 * to count them. Unfiltered callers should keep using
 * `countFindingsByStatusForProject`.
 */
export async function countFindingsByStatusForList(
  drizzle: DrizzleDb,
  projectId: string,
  filters: Pick<
    FindingsPageFilters,
    "severity" | "controlId" | "engine" | "remediation"
  > = {},
): Promise<Record<FindingStatus, number>> {
  const rows = await drizzle
    .select({ status: findings.status, value: count() })
    .from(findings)
    .where(findingsPageWhere(projectId, filters))
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
  controlIds?: readonly string[],
): Promise<Map<string, number>> {
  if (controlIds && controlIds.length === 0) return new Map();
  const rows = await drizzle
    .select({ controlId: findings.controlId, value: count() })
    .from(findings)
    .where(
      and(
        eq(findings.projectId, projectId),
        eq(findings.status, "open"),
        controlIds ? inArray(findings.controlId, [...controlIds]) : undefined,
      ),
    )
    .groupBy(findings.controlId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.controlId, Number(row.value ?? 0));
  }
  return counts;
}

/**
 * Open findings detected strictly after `since`, keyed by control id. Used to
 * show findings that a sticky human decision (exception / human pass) is
 * masking — the decision never surfaces regressions on its own.
 */
export async function countsOfOpenFindingsDetectedAfterForControls(
  drizzle: DrizzleDb,
  projectId: string,
  controlIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (controlIds.length === 0) return new Map();
  const rows = await drizzle
    .select({ controlId: findings.controlId, value: count() })
    .from(findings)
    .where(
      and(
        eq(findings.projectId, projectId),
        eq(findings.status, "open"),
        inArray(findings.controlId, [...controlIds]),
        isNotNull(findings.detectedAt),
        gt(findings.detectedAt, since.toISOString()),
      ),
    )
    .groupBy(findings.controlId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.controlId, Number(row.value ?? 0));
  }
  return counts;
}

/**
 * Open findings for a set of controls: the only finding rows an interactive
 * requirement-status refresh needs (it derives per control from that
 * control's open findings). Served by `findings_project_control_idx`.
 */
export async function listOpenFindingsForControls(
  drizzle: DrizzleDb,
  projectId: string,
  controlIds: readonly string[],
): Promise<Finding[]> {
  if (controlIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(
      and(
        eq(findings.projectId, projectId),
        eq(findings.status, "open"),
        inArray(findings.controlId, [...controlIds]),
      ),
    );
  return rows.map((row) => row.payload);
}

export async function upsertFindings(
  tx: DrizzleDb,
  items: ReadonlyArray<Finding>,
): Promise<void> {
  await upsertPayloadRows(items, findingToRow, async (rows) => {
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
          // Projections must follow the payload on every write: a re-detected
          // finding that was downgraded (or changed kind/engine/detection
          // date) would otherwise keep stale filter, ordering and portfolio
          // values while its JSONB says otherwise.
          kind: sql`excluded.kind`,
          severityRank: sql`excluded.severity_rank`,
          engine: sql`excluded.engine`,
          detectedAt: sql`excluded.detected_at`,
          payload: sql`excluded.payload`,
        },
      });
  });
}
