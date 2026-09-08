import { eq, inArray, sql } from "drizzle-orm";
import type { Finding } from "../types";
import type { DrizzleDb } from "../client.ts";
import { findings } from "../schema.ts";
import { findingToRow } from "./mappers.ts";
import { filterStalePayloadWrites, stampedNow } from "./upsert-guard.ts";

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
  if (items.length === 0) return;

  const toWrite = await filterStalePayloadWrites(
    items.map(stampedNow),
    options.loadedUpdatedAtById,
    async (ids) => {
      const rows = await tx
        .select({ id: findings.id, payload: findings.payload })
        .from(findings)
        .where(inArray(findings.id, [...ids]));
      return new Map(rows.map((row) => [row.id, row.payload.updatedAt]));
    },
  );

  if (toWrite.length === 0) return;
  await tx
    .insert(findings)
    .values(toWrite.map(findingToRow))
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
}

export async function upsertFinding(
  tx: DrizzleDb,
  finding: Finding,
  options?: UpsertFindingsOptions,
): Promise<void> {
  await upsertFindings(tx, [finding], options);
}