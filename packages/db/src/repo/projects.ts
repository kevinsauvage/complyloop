import { eq, inArray, sql } from "drizzle-orm";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import { projects } from "../schema.ts";
import { projectToRow } from "./mappers.ts";

export async function insertProject(tx: DrizzleDb, project: Project): Promise<void> {
  await tx.insert(projects).values(projectToRow(project));
}

export async function updateProject(tx: DrizzleDb, project: Project): Promise<void> {
  await tx
    .insert(projects)
    .values(projectToRow(project))
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        name: sql`excluded.name`,
        ownerUserId: sql`excluded.owner_user_id`,
        orgId: sql`excluded.org_id`,
        payload: sql`excluded.payload`,
      },
    });
}

export async function deleteProject(tx: DrizzleDb, projectId: string): Promise<void> {
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

/** Look up a GitHub-connected project by owner/repo full name (webhooks). */
export async function findProjectByGithubFullName(
  drizzle: DrizzleDb,
  fullName: string,
): Promise<{ id: string; orgId: string; defaultBranch?: string; installationId?: number } | null> {
  const normalized = fullName.toLowerCase();
  const rows = await drizzle
    .select({
      id: projects.id,
      orgId: projects.orgId,
      githubDefaultBranch: sql<string | null>`${projects.payload}->'github'->>'defaultBranch'`,
      githubInstallationId: sql<string | null>`${projects.payload}->'github'->>'installationId'`,
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
    ...(typeof row.githubInstallationId === "string" && row.githubInstallationId.length > 0
      ? { installationId: Number(row.githubInstallationId) }
      : {}),
  };
}
