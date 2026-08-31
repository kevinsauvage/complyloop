import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { EvidenceKind, EvidenceRecord } from "@/core/finding-types";
import { DEFAULT_PAGE_SIZE } from "@/core/pagination";
import type { DrizzleDb } from "./client";
import { rowToEvidence } from "./postgres-evidence";
import { evidence, memberships, projects } from "./schema";

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

/** All evidence for a project, oldest-first (exports / reports). */
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
): Promise<{ id: string; orgId: string | null } | null> {
  const normalized = fullName.toLowerCase();
  const rows = await drizzle
    .select({
      id: projects.id,
      orgId: projects.orgId,
      payload: projects.payload,
    })
    .from(projects)
    .where(
      sql`lower((${projects.payload}->'github'->>'fullName')) = ${normalized}`,
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, orgId: row.orgId };
}

export async function loadProjectOrgAndId(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<{ id: string; orgId: string | null } | null> {
  const rows = await drizzle
    .select({ id: projects.id, orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0] ?? null;
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

/** Project ids visible to a tenant scope (org membership and/or owner). */
export async function listProjectIdsForTenant(
  drizzle: DrizzleDb,
  input: {
    orgIds: readonly string[];
    userId: string | null;
    preferredProjectId?: string | null;
  },
): Promise<string[]> {
  const ids = new Set<string>();
  if (input.orgIds.length > 0) {
    const byOrg = await drizzle
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.orgId, [...input.orgIds]));
    for (const row of byOrg) ids.add(row.id);
  }
  if (input.userId) {
    const owned = await drizzle
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerUserId, input.userId));
    for (const row of owned) ids.add(row.id);
  }
  if (input.preferredProjectId) {
    const preferred = await drizzle
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.preferredProjectId))
      .limit(1);
    if (preferred[0]) ids.add(preferred[0].id);
  }
  return [...ids];
}
