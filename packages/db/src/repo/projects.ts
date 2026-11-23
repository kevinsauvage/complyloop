import { eq, inArray, type SQL, sql } from "drizzle-orm";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import type { DrizzleDb } from "../postgres.ts";
import { projects } from "../schema.ts";
import { deleteAssessmentJobsForProject } from "./assessment-jobs.ts";
import { projectToRow } from "./mappers.ts";

export async function insertProject(
  tx: DrizzleDb,
  project: Project,
): Promise<void> {
  await tx.insert(projects).values(projectToRow(project));
}

/**
 * After connect, `lastDeployment` and the repository identity
 * (`github.defaultBranch`, `github.fullName`, `github.repoId`) are
 * written only by GitHub deliveries, which do not take the project write lock
 * (a delivery must answer within seconds, an assessment apply can hold that
 * lock longer). A whole-payload rewrite therefore keeps the stored values, so a
 * settings save racing a delivery cannot roll them back to its stale copy —
 * including after a repository rename.
 */
const DELIVERY_OWNED_PATHS = [
  "{lastDeployment}",
  "{github,defaultBranch}",
  "{github,fullName}",
  "{github,repoId}",
] as const;

/**
 * `excluded.payload` with each stored delivery-owned value put back. A path
 * whose parent is absent from the incoming payload (no `github`) stays absent:
 * `jsonb_set` does not create intermediate objects.
 */
const PAYLOAD_KEEPING_DELIVERY_FIELDS = DELIVERY_OWNED_PATHS.reduce<SQL>(
  (payload, path) => sql`CASE
    WHEN projects.payload #>> ${path}::text[] IS NOT NULL
      THEN jsonb_set(${payload}, ${path}::text[], projects.payload #> ${path}::text[])
    ELSE ${payload} END`,
  sql`excluded.payload`,
);

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

/**
 * Records the stable repository identity from a delivery. A rename or transfer
 * changes only the name; the id is the compare-and-set key, so the update is a
 * no-op when the stored identity already matches. Delivery-owned, no project
 * lock — same rule as `lastDeployment` / `defaultBranch`.
 */
export async function recordProjectRepositoryIdentity(
  drizzle: DrizzleDb,
  projectId: string,
  identity: { repoId: number; fullName: string },
): Promise<void> {
  await drizzle.execute(sql`
    UPDATE projects
    SET payload = jsonb_set(
      jsonb_set(
        payload - 'sourceRef',
        '{github,repoId}'::text[],
        to_jsonb(${identity.repoId}::bigint)
      ),
      '{github,fullName}'::text[],
      to_jsonb(${identity.fullName}::text)
    )
    WHERE id = ${projectId}
      AND (
        payload->'github'->>'repoId' IS DISTINCT FROM ${String(identity.repoId)}
        OR lower(payload->'github'->>'fullName') IS DISTINCT FROM lower(${identity.fullName})
      )
  `);
}

export async function deleteProject(
  tx: DrizzleDb,
  projectId: string,
): Promise<void> {
  await deleteAssessmentJobsForProject(tx, projectId);
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
): Promise<DeliveryProject[]> {
  const normalized = fullName.toLowerCase();
  return findDeliveryProjects(
    drizzle,
    sql`lower((${projects.payload}->'github'->>'fullName')) = ${normalized}`,
  );
}

/**
 * Stable-identity lookup: a repository id survives renames and transfers, so
 * deliveries try this before falling back to `fullName` (legacy rows connected
 * before the id was stored).
 */
export async function findProjectsByGithubRepoId(
  drizzle: DrizzleDb,
  repoId: number,
): Promise<DeliveryProject[]> {
  return findDeliveryProjects(
    drizzle,
    sql`(${projects.payload}->'github'->>'repoId') = ${String(repoId)}`,
  );
}

export interface DeliveryProject {
  id: string;
  orgId: string;
  fullName?: string;
  repoId?: number;
  defaultBranch?: string;
  trackedBranch?: string;
  installationId?: number;
}

const DELIVERY_PROJECT_COLUMNS = {
  id: projects.id,
  orgId: projects.orgId,
  githubFullName: sql<
    string | null
  >`${projects.payload}->'github'->>'fullName'`,
  githubRepoId: sql<string | null>`${projects.payload}->'github'->>'repoId'`,
  githubDefaultBranch: sql<
    string | null
  >`${projects.payload}->'github'->>'defaultBranch'`,
  githubTrackedBranch: sql<
    string | null
  >`${projects.payload}->'github'->>'trackedBranch'`,
  githubInstallationId: sql<
    string | null
  >`${projects.payload}->'github'->>'installationId'`,
} as const;

type DeliveryProjectRow = {
  id: string;
  orgId: string;
  githubFullName: string | null;
  githubRepoId: string | null;
  githubDefaultBranch: string | null;
  githubTrackedBranch: string | null;
  githubInstallationId: string | null;
};

function positiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonEmpty(value: string | null): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toDeliveryProjects(
  rows: readonly DeliveryProjectRow[],
): DeliveryProject[] {
  return rows.map((row) => {
    const repoId = positiveInteger(row.githubRepoId);
    const fullName = nonEmpty(row.githubFullName);
    const trackedBranch = nonEmpty(row.githubTrackedBranch);
    const installationId = positiveInteger(row.githubInstallationId);
    return {
      id: row.id,
      orgId: row.orgId,
      ...(fullName ? { fullName } : {}),
      ...(repoId !== undefined ? { repoId } : {}),
      ...(typeof row.githubDefaultBranch === "string"
        ? { defaultBranch: row.githubDefaultBranch }
        : {}),
      ...(trackedBranch ? { trackedBranch } : {}),
      ...(installationId !== undefined ? { installationId } : {}),
    };
  });
}

async function findDeliveryProjects(
  drizzle: DrizzleDb,
  condition: SQL,
): Promise<DeliveryProject[]> {
  const rows = await drizzle
    .select(DELIVERY_PROJECT_COLUMNS)
    .from(projects)
    .where(condition)
    .orderBy(projects.id);
  return toDeliveryProjects(rows as DeliveryProjectRow[]);
}
