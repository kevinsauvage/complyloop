import { eq, inArray, sql } from "drizzle-orm";
import type { Remediation } from "../types";
import type { DrizzleDb } from "../client.ts";
import { findings, remediations } from "../schema.ts";
import { remediationToRow } from "./mappers.ts";
import { upsertPayloadRows } from "./upsert-guard.ts";

export async function getRemediationByFindingId(
  drizzle: DrizzleDb,
  findingId: string,
): Promise<Remediation | undefined> {
  const rows = await drizzle
    .select({ payload: remediations.payload })
    .from(remediations)
    .where(eq(remediations.findingId, findingId))
    .limit(1);
  return rows[0]?.payload;
}

export async function listRemediationsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Remediation[]> {
  const findingRows = await drizzle
    .select({ id: findings.id })
    .from(findings)
    .where(eq(findings.projectId, projectId));
  const findingIds = findingRows.map((row) => row.id);
  if (findingIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: remediations.payload })
    .from(remediations)
    .where(inArray(remediations.findingId, findingIds));
  return rows.map((row) => row.payload);
}

export interface UpsertRemediationsOptions {
  /**
   * Remediation `updatedAt` values captured when the writing slice was loaded.
   * Rows whose DB copy was updated afterward (a human approval/verify during a
   * webhook assessment) are skipped so a stale apply cannot revert them.
   */
  loadedUpdatedAtById?: ReadonlyMap<string, string>;
}

export async function upsertRemediations(
  tx: DrizzleDb,
  items: ReadonlyArray<Remediation>,
  options: UpsertRemediationsOptions = {},
): Promise<void> {
  await upsertPayloadRows(
    items,
    options.loadedUpdatedAtById,
    async (ids) => {
      const rows = await tx
        .select({ id: remediations.id, payload: remediations.payload })
        .from(remediations)
        .where(inArray(remediations.id, [...ids]));
      return new Map(rows.map((row) => [row.id, row.payload.updatedAt]));
    },
    remediationToRow,
    async (rows) => {
      await tx
        .insert(remediations)
        .values(rows)
        .onConflictDoUpdate({
          target: remediations.id,
          set: {
            findingId: sql`excluded.finding_id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        });
    },
  );
}

export async function upsertRemediation(
  tx: DrizzleDb,
  remediation: Remediation,
  options?: UpsertRemediationsOptions,
): Promise<void> {
  await upsertRemediations(tx, [remediation], options);
}