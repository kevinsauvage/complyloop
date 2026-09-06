import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  Assessment,
  EvidenceKind,
  EvidenceRecord,
} from "@complyloop/analysis-core/contract/finding-types";
import { DEFAULT_PAGE_SIZE } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "./client.ts";
import { rowToEvidence } from "./postgres-evidence.ts";
import { EVIDENCE_EXPORT_LIMIT } from "./postgres-scope.ts";
import { assessmentFromRow } from "./repo/mappers.ts";
import { assessments, evidence, memberships, projects } from "./schema.ts";

export { EVIDENCE_EXPORT_LIMIT } from "./postgres-scope.ts";

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

function evidenceProjectFilter(projectId: string, kind?: EvidenceKind) {
  const projectClause = eq(evidence.projectId, projectId);
  if (!kind) return projectClause;
  return and(projectClause, eq(evidence.kind, kind));
}

export async function countEvidenceForProject(
  drizzle: DrizzleDb,
  projectId: string,
  kind?: EvidenceKind,
): Promise<number> {
  const [row] = await drizzle
    .select({ value: count() })
    .from(evidence)
    .where(evidenceProjectFilter(projectId, kind));
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
  kind?: EvidenceKind,
): Promise<EvidenceRecord[]> {
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(evidenceProjectFilter(projectId, kind))
    .orderBy(desc(evidence.at))
    .limit(pageSize)
    .offset(sqlPageOffset(page, pageSize));
  return rows.map(rowToEvidence);
}

/** All evidence for a project, oldest-first (unbounded — prefer {@link listEvidenceForExport}). */
export async function listAllEvidenceForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<EvidenceRecord[]> {
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(eq(evidence.projectId, projectId))
    .orderBy(asc(evidence.at));
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
    .orderBy(desc(sql`${assessments.payload}->>'completedAt'`));
  return rows.map((row) => assessmentFromRow(row));
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

/** Look up a GitHub-connected project by owner/repo full name (webhooks). */
export async function findProjectByGithubFullName(
  drizzle: DrizzleDb,
  fullName: string,
): Promise<{ id: string; orgId: string; defaultBranch?: string } | null> {
  const normalized = fullName.toLowerCase();
  const rows = await drizzle
    .select({
      id: projects.id,
      orgId: projects.orgId,
      githubDefaultBranch: sql<string | null>`${projects.payload}->'github'->>'defaultBranch'`,
    })
    .from(projects)
    .where(
      sql`lower((${projects.payload}->'github'->>'fullName')) = ${normalized}`,
    )
    .limit(1);
  const row = rows[0];
  if (!row?.orgId) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    ...(typeof row.githubDefaultBranch === "string"
      ? { defaultBranch: row.githubDefaultBranch }
      : {}),
  };
}

/** Org ids the user belongs to (membership lookup before a scoped load). */
export async function listOrgIdsForUser(
  drizzle: DrizzleDb,
  userId: string | null,
  githubLogin: string | null,
): Promise<string[]> {
  if (!userId && !githubLogin) return [];
  const clauses = [];
  if (userId) clauses.push(eq(memberships.userId, userId));
  if (githubLogin) clauses.push(eq(memberships.githubLogin, githubLogin));
  const rows = await drizzle
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(or(...clauses));
  return [...new Set(rows.map((row) => row.orgId))];
}
