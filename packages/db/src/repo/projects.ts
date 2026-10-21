import { eq, inArray, sql } from "drizzle-orm";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import type { DrizzleDb } from "../postgres.ts";
import { projects } from "../schema.ts";
import { projectToRow } from "./mappers.ts";

export async function insertProject(
  tx: DrizzleDb,
  project: Project,
): Promise<void> {
  await tx.insert(projects).values(projectToRow(project));
}

/**
 * After connect, `lastDeployment` and `github.defaultBranch` are written only
 * by GitHub deliveries, which do not take the project write lock (a delivery
 * must answer within seconds, an assessment apply can hold that lock longer).
 * A whole-payload rewrite therefore keeps the stored values, so a settings
 * save racing a delivery cannot roll them back to its stale copy.
 */
const PAYLOAD_KEEPING_LAST_DEPLOYMENT = sql`CASE
  WHEN projects.payload ? 'lastDeployment'
    THEN jsonb_set(excluded.payload, '{lastDeployment}', projects.payload->'lastDeployment')
  ELSE excluded.payload END`;
const PAYLOAD_KEEPING_DELIVERY_FIELDS = sql`CASE
  WHEN projects.payload->'github' ? 'defaultBranch' AND excluded.payload ? 'github'
    THEN jsonb_set(${PAYLOAD_KEEPING_LAST_DEPLOYMENT}, '{github,defaultBranch}', projects.payload->'github'->'defaultBranch')
  ELSE ${PAYLOAD_KEEPING_LAST_DEPLOYMENT} END`;

export async function updateProject(
  tx: DrizzleDb,
  project: Project,
): Promise<void> {
  await tx
    .insert(projects)
    .values(projectToRow(project))
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        name: sql`excluded.name`,
        ownerUserId: sql`excluded.owner_user_id`,
        orgId: sql`excluded.org_id`,
        payload: PAYLOAD_KEEPING_DELIVERY_FIELDS,
      },
    });
}

/**
 * Records the repository's live default branch from a delivery. Compare-and-
 * set in one UPDATE (concurrent deliveries race here; IS DISTINCT FROM also
 * covers a missing value), then returns the stored value so every delivery
 * decides authority on the converged row.
 */
export async function recordProjectDefaultBranch(
  drizzle: DrizzleDb,
  projectId: string,
  branch: string,
): Promise<string | undefined> {
  await drizzle.execute(sql`
    UPDATE projects
    SET payload = jsonb_set(payload, '{github,defaultBranch}', to_jsonb(${branch}::text), true)
    WHERE id = ${projectId}
      AND (payload->'github'->>'defaultBranch' IS DISTINCT FROM ${branch})
  `);
  return (await getProjectById(drizzle, projectId))?.github?.defaultBranch;
}

/**
 * Records the newest tracked-branch deployment so manual runs can audit it.
 * Compare-and-set on the SHA: a redelivery is a no-op.
 */
export async function recordProjectLastDeployment(
  drizzle: DrizzleDb,
  projectId: string,
  target: { url: string; sha: string },
): Promise<void> {
  await drizzle.execute(sql`
    UPDATE projects
    SET payload = jsonb_set(payload, '{lastDeployment}', ${JSON.stringify(target)}::jsonb, true)
    WHERE id = ${projectId}
      AND (payload->'lastDeployment'->>'sha') IS DISTINCT FROM ${target.sha}
  `);
}

export async function deleteProject(
  tx: DrizzleDb,
  projectId: string,
): Promise<void> {
  await tx.delete(projects).where(eq(projects.id, projectId));
}

export async function listProjectsForOrgs(
  drizzle: DrizzleDb,
  orgIds: readonly string[],
): Promise<Project[]> {
  if (orgIds.length === 0) return [];
  const rows = await drizzle
    .select()
    .from(projects)
    .where(inArray(projects.orgId, [...orgIds]));
  return rows.map((row) => row.payload);
}

export async function getProjectById(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Project | undefined> {
  const rows = await drizzle
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0]?.payload;
}

/**
 * Look up GitHub-connected projects by owner/repo full name (webhooks).
 * Uniqueness is per-org, so the same public repo may be connected in several
 * orgs — returns every match in deterministic id order and lets the caller
 * disambiguate by installation id. Never `.limit(1)` here: picking an
 * arbitrary row is a cross-tenant mutation bug.
 */
export async function findProjectsByGithubFullName(
  drizzle: DrizzleDb,
  fullName: string,
): Promise<
  Array<{
    id: string;
    orgId: string;
    defaultBranch?: string;
    trackedBranch?: string;
    installationId?: number;
  }>
> {
  const normalized = fullName.toLowerCase();
  const rows = await drizzle
    .select({
      id: projects.id,
      orgId: projects.orgId,
      githubDefaultBranch: sql<
        string | null
      >`${projects.payload}->'github'->>'defaultBranch'`,
      githubTrackedBranch: sql<
        string | null
      >`${projects.payload}->'github'->>'trackedBranch'`,
      githubInstallationId: sql<
        string | null
      >`${projects.payload}->'github'->>'installationId'`,
    })
    .from(projects)
    .where(
      sql`lower((${projects.payload}->'github'->>'fullName')) = ${normalized}`,
    )
    .orderBy(projects.id);
  return rows.flatMap((row) => {
    if (!row?.orgId) return [];
    return [
      {
        id: row.id,
        orgId: row.orgId,
        ...(typeof row.githubDefaultBranch === "string"
          ? { defaultBranch: row.githubDefaultBranch }
          : {}),
        ...(typeof row.githubTrackedBranch === "string" &&
        row.githubTrackedBranch.length > 0
          ? { trackedBranch: row.githubTrackedBranch }
          : {}),
        ...(typeof row.githubInstallationId === "string" &&
        row.githubInstallationId.length > 0
          ? { installationId: Number(row.githubInstallationId) }
          : {}),
      },
    ];
  });
}
