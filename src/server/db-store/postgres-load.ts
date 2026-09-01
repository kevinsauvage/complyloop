import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db, DbLoadScope } from "./types";
import type { DrizzleDb } from "./client";
import {
  alerts,
  assessments,
  controls,
  evidence,
  findings,
  frameworks,
  memberships,
  organizations,
  projects,
  remediations,
  requirements,
} from "./schema";
import { rowToEvidence } from "./postgres-evidence";
import { fullLoadScope, isFullLoadScope } from "./postgres-scope";
import {
  listOrgIdsForUser,
  listProjectIdsForTenant,
} from "./postgres-queries";

async function loadCatalog(drizzle: DrizzleDb) {
  const [frameworkRows, controlRows] = await Promise.all([
    drizzle.select().from(frameworks),
    drizzle.select().from(controls),
  ]);
  return {
    frameworks: frameworkRows.map((row) => row.payload),
    controls: controlRows.map((row) => row.payload),
  };
}

async function loadEvidenceForScope(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
  evidenceLimit: number | undefined,
) {
  if (projectIds.length === 0 || evidenceLimit === 0) return [];

  if (evidenceLimit === undefined) {
    const rows = await drizzle
      .select()
      .from(evidence)
      .where(inArray(evidence.projectId, [...projectIds]))
      .orderBy(asc(evidence.at));
    return rows.map(rowToEvidence);
  }

  // Newest-first window, then reverse so in-memory order stays oldest→newest.
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(inArray(evidence.projectId, [...projectIds]))
    .orderBy(desc(evidence.at))
    .limit(evidenceLimit);
  return rows.reverse().map(rowToEvidence);
}

async function loadScopedRuntime(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) {
    return {
      requirements: [] as Db["requirements"],
      assessments: [] as Db["assessments"],
      findings: [] as Db["findings"],
      remediations: [] as Db["remediations"],
      alerts: [] as Db["alerts"],
    };
  }

  const ids = [...projectIds];
  const [requirementRows, assessmentRows, findingRows, alertRows] =
    await Promise.all([
      drizzle
        .select()
        .from(requirements)
        .where(inArray(requirements.projectId, ids)),
      drizzle
        .select()
        .from(assessments)
        .where(inArray(assessments.projectId, ids)),
      drizzle.select().from(findings).where(inArray(findings.projectId, ids)),
      drizzle.select().from(alerts).where(inArray(alerts.projectId, ids)),
    ]);

  const findingIds = findingRows.map((row) => row.id);
  const remediationRows =
    findingIds.length === 0
      ? []
      : await drizzle
          .select()
          .from(remediations)
          .where(inArray(remediations.findingId, findingIds));

  return {
    requirements: requirementRows.map((row) => row.payload),
    assessments: assessmentRows.map((row) => row.payload),
    findings: findingRows.map((row) => row.payload),
    remediations: remediationRows.map((row) => row.payload),
    alerts: alertRows.map((row) => row.payload),
  };
}

async function loadScopedTenant(
  drizzle: DrizzleDb,
  scope: Extract<DbLoadScope, { mode: "scoped" }>,
): Promise<Db> {
  const orgIds = [...scope.orgIds];
  const projectIds = [...scope.projectIds];

  const [catalog, organizationRows, membershipRows, projectRows, runtime, evidenceRows] =
    await Promise.all([
      loadCatalog(drizzle),
      orgIds.length === 0
        ? Promise.resolve([])
        : drizzle
            .select()
            .from(organizations)
            .where(inArray(organizations.id, orgIds)),
      orgIds.length === 0
        ? Promise.resolve([])
        : drizzle
            .select()
            .from(memberships)
            .where(inArray(memberships.orgId, orgIds)),
      projectIds.length === 0
        ? Promise.resolve([])
        : drizzle
            .select()
            .from(projects)
            .where(inArray(projects.id, projectIds)),
      loadScopedRuntime(drizzle, projectIds),
      loadEvidenceForScope(drizzle, projectIds, scope.evidenceLimit),
    ]);

  return {
    ...catalog,
    organizations: organizationRows.map((row) => row.payload),
    memberships: membershipRows.map((row) => row.payload),
    projects: projectRows.map((row) => row.payload),
    ...runtime,
    evidence: evidenceRows,
    loadScope: scope,
  };
}

async function loadFull(drizzle: DrizzleDb): Promise<Db> {
  const [
    catalog,
    organizationRows,
    membershipRows,
    projectRows,
    requirementRows,
    assessmentRows,
    findingRows,
    remediationRows,
    evidenceRows,
    alertRows,
  ] = await Promise.all([
    loadCatalog(drizzle),
    drizzle.select().from(organizations),
    drizzle.select().from(memberships),
    drizzle.select().from(projects),
    drizzle.select().from(requirements),
    drizzle.select().from(assessments),
    drizzle.select().from(findings),
    drizzle.select().from(remediations),
    drizzle.select().from(evidence).orderBy(asc(evidence.at)),
    drizzle.select().from(alerts),
  ]);

  return {
    ...catalog,
    organizations: organizationRows.map((row) => row.payload),
    memberships: membershipRows.map((row) => row.payload),
    projects: projectRows.map((row) => row.payload),
    requirements: requirementRows.map((row) => row.payload),
    assessments: assessmentRows.map((row) => row.payload),
    findings: findingRows.map((row) => row.payload),
    remediations: remediationRows.map((row) => row.payload),
    evidence: evidenceRows.map(rowToEvidence),
    alerts: alertRows.map((row) => row.payload),
    loadScope: fullLoadScope(),
  };
}

/**
 * Loads a {@link Db} snapshot. Prefer a scoped load for request paths so
 * evidence/findings JSONB payloads stay bounded to the caller's tenant.
 */
export async function loadDbFromPostgres(
  drizzle: DrizzleDb,
  scope: DbLoadScope = fullLoadScope(),
): Promise<Db> {
  if (isFullLoadScope(scope)) return loadFull(drizzle);
  return loadScopedTenant(drizzle, scope);
}

/** Resolves the tenant scope for a signed-in (or cookie-preferred) viewer. */
export async function resolveWorkspaceLoadScope(
  drizzle: DrizzleDb,
  input: {
    userId: string | null;
    githubLogin: string | null;
    preferredProjectId?: string | null;
    evidenceLimit?: number;
  },
): Promise<DbLoadScope> {
  const orgIds = await listOrgIdsForUser(
    drizzle,
    input.userId,
    input.githubLogin,
  );
  const projectIds = await listProjectIdsForTenant(drizzle, {
    orgIds,
    preferredProjectId: input.preferredProjectId,
  });
  return {
    mode: "scoped",
    orgIds,
    projectIds,
    evidenceLimit: input.evidenceLimit,
  };
}

/** Project-scoped load for assessment workers / single-project writers. */
export async function resolveProjectLoadScope(
  drizzle: DrizzleDb,
  projectId: string,
  evidenceLimit: number = 0,
): Promise<DbLoadScope> {
  const rows = await drizzle
    .select({ id: projects.id, orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row?.orgId) {
    return {
      mode: "scoped",
      orgIds: [],
      projectIds: [],
      evidenceLimit,
    };
  }
  return {
    mode: "scoped",
    orgIds: [row.orgId],
    projectIds: [row.id],
    evidenceLimit,
  };
}
