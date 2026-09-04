import { eq, inArray, sql } from "drizzle-orm";
import type { Project } from "@/core/project-types";
import type { DrizzleDb } from "../client";
import { projects } from "../schema";
import { projectToRow } from "./mappers";

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
