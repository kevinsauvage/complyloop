import { eq, inArray, sql } from "drizzle-orm";
import type { Finding } from "../types";
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

export async function listFindingsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Finding[]> {
  const rows = await drizzle
    .select({ payload: findings.payload })
    .from(findings)
    .where(eq(findings.projectId, projectId));
  return rows.map((row) => row.payload);
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
