import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { EvidenceKind, EvidenceRecord } from "../types";
import { DEFAULT_PAGE_SIZE } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../postgres.ts";
import { evidence } from "../schema.ts";
import {
  evidenceToRow,
  newEvidenceRecord,
  rowToEvidence,
} from "./mappers.ts";

/** Newest-first evidence rows kept in the workspace read snapshot. */
export const WORKSPACE_EVIDENCE_LIMIT = 100;

/**
 * Newest rows included in JSON / report exports. Decision records stay in the
 * DB forever (append-only); this only bounds the download, not the table.
 */
export const EVIDENCE_EXPORT_LIMIT = 5_000;

/** How many rows an export should take, and whether the table was larger. */
export function evidenceExportWindow(
  total: number,
  limit: number,
): { take: number; truncated: boolean } {
  return { take: Math.min(total, limit), truncated: total > limit };
}

/** Zero-based OFFSET for a 1-based UI page. */
export function sqlPageOffset(page: number, pageSize: number): number {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return (safePage - 1) * pageSize;
}

export async function insertEvidence(
  tx: DrizzleDb,
  entry: Omit<EvidenceRecord, "id" | "at">,
): Promise<EvidenceRecord> {
  const record = newEvidenceRecord(entry);
  await tx.insert(evidence).values(evidenceToRow(record));
  return record;
}

export async function insertEvidenceRecords(
  tx: DrizzleDb,
  records: ReadonlyArray<EvidenceRecord>,
): Promise<void> {
  if (records.length === 0) return;
  await tx.insert(evidence).values(records.map(evidenceToRow));
}

/** Text/date/author narrowing for the evidence page. */
export interface EvidenceFilter {
  kind?: EvidenceKind;
  /** Case-insensitive substring match on `summary`. */
  q?: string;
  /** Inclusive `YYYY-MM-DD` lower bound on `at` (UTC). */
  from?: string;
  /** Inclusive `YYYY-MM-DD` upper bound on `at` (UTC). */
  to?: string;
  /** Case-insensitive substring match on `actor` (unset = automated). */
  actor?: string;
}

/** A bare kind where callers predate the filter object. */
function normalizeEvidenceFilter(
  kindOrFilter?: EvidenceKind | EvidenceFilter,
): EvidenceFilter {
  if (!kindOrFilter) return {};
  return typeof kindOrFilter === "string" ? { kind: kindOrFilter } : kindOrFilter;
}

/** Escape LIKE wildcards so `q` always matches literally. */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Pure WHERE-clause builder — unit-testable without a database. */
export function evidenceFilterConditions(
  projectId: string,
  filter: EvidenceFilter = {},
): SQL[] {
  const conditions: SQL[] = [eq(evidence.projectId, projectId)];
  if (filter.kind) conditions.push(eq(evidence.kind, filter.kind));
  if (filter.q) {
    conditions.push(ilike(evidence.summary, `%${escapeLikeLiteral(filter.q)}%`));
  }
  if (filter.from) {
    // `at` is string-moded: compare ISO bounds and let Postgres cast.
    conditions.push(gte(evidence.at, `${filter.from}T00:00:00.000Z`));
  }
  if (filter.to) {
    conditions.push(lte(evidence.at, `${filter.to}T23:59:59.999Z`));
  }
  if (filter.actor) {
    // Rows with no actor render as "System" in the UI; `ilike` never matches
    // NULL, so searching "System" must include unset actors.
    if (filter.actor.trim().toLowerCase() === "system") {
      conditions.push(
        or(
          isNull(evidence.actor),
          ilike(evidence.actor, `%${escapeLikeLiteral(filter.actor)}%`),
        )!,
      );
    } else {
      conditions.push(ilike(evidence.actor, `%${escapeLikeLiteral(filter.actor)}%`));
    }
  }
  return conditions;
}

function evidenceProjectFilter(projectId: string, filter: EvidenceFilter = {}) {
  return and(...evidenceFilterConditions(projectId, filter));
}

export async function countEvidenceForProject(
  drizzle: DrizzleDb,
  projectId: string,
  kindOrFilter?: EvidenceKind | EvidenceFilter,
): Promise<number> {
  const [row] = await drizzle
    .select({ value: count() })
    .from(evidence)
    .where(evidenceProjectFilter(projectId, normalizeEvidenceFilter(kindOrFilter)));
  return Number(row?.value ?? 0);
}

/** Per-kind counts for filter chips on the evidence page. */
export async function countEvidenceKindsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Map<EvidenceKind, number>> {
  const rows = await drizzle
    .select({ kind: evidence.kind, value: count() })
    .from(evidence)
    .where(eq(evidence.projectId, projectId))
    .groupBy(evidence.kind);
  const counts = new Map<EvidenceKind, number>();
  for (const row of rows) {
    counts.set(row.kind as EvidenceKind, Number(row.value ?? 0));
  }
  return counts;
}

/** Newest-first page of evidence for a project (matches the evidence UI). */
export async function listEvidencePageForProject(
  drizzle: DrizzleDb,
  projectId: string,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  kindOrFilter?: EvidenceKind | EvidenceFilter,
): Promise<EvidenceRecord[]> {
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(evidenceProjectFilter(projectId, normalizeEvidenceFilter(kindOrFilter)))
    .orderBy(desc(evidence.at))
    .limit(pageSize)
    .offset(sqlPageOffset(page, pageSize));
  return rows.map(rowToEvidence);
}

export interface EvidenceExportPage {
  records: EvidenceRecord[];
  total: number;
  truncated: boolean;
  limit: number;
}

/** Newest `limit` evidence rows, returned oldest-first, with a truncation flag. */
export async function listEvidenceForExport(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number = EVIDENCE_EXPORT_LIMIT,
): Promise<EvidenceExportPage> {
  const total = await countEvidenceForProject(drizzle, projectId);
  const { take, truncated } = evidenceExportWindow(total, limit);
  if (take === 0) {
    return { records: [], total, truncated, limit };
  }
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(eq(evidence.projectId, projectId))
    .orderBy(desc(evidence.at))
    .limit(take);
  return {
    records: rows.reverse().map(rowToEvidence),
    total,
    truncated,
    limit,
  };
}

export async function listEvidenceForFinding(
  drizzle: DrizzleDb,
  findingId: string,
): Promise<EvidenceRecord[]> {
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(eq(evidence.findingId, findingId))
    .orderBy(desc(evidence.at));
  return rows.map(rowToEvidence);
}

/** All evidence for many projects, oldest-first (org export). */
export async function listAllEvidenceForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<EvidenceRecord[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(inArray(evidence.projectId, [...projectIds]))
    .orderBy(asc(evidence.at));
  return rows.map(rowToEvidence);
}
