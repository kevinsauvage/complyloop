import { inArray, sql } from "drizzle-orm";
import type { Remediation } from "@complyloop/analysis-core/contract/finding-types";
import type { DrizzleDb } from "../client.ts";
import { remediations } from "../schema.ts";
import { remediationToRow } from "./mappers.ts";
import { filterNotStale, stampedNow } from "./upsert-guard.ts";

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
  if (items.length === 0) return;

  let toWrite = items.map(stampedNow);
  const { loadedUpdatedAtById } = options;
  if (loadedUpdatedAtById && loadedUpdatedAtById.size > 0) {
    const ids = toWrite.map((item) => item.id);
    const rows = await tx
      .select({ id: remediations.id, payload: remediations.payload })
      .from(remediations)
      .where(inArray(remediations.id, ids));
    const dbUpdatedAtById = new Map(
      rows.map((row) => [row.id, row.payload.updatedAt]),
    );
    toWrite = filterNotStale(
      toWrite,
      loadedUpdatedAtById,
      dbUpdatedAtById,
    );
  }

  if (toWrite.length === 0) return;
  await tx
    .insert(remediations)
    .values(toWrite.map(remediationToRow))
    .onConflictDoUpdate({
      target: remediations.id,
      set: {
        findingId: sql`excluded.finding_id`,
        status: sql`excluded.status`,
        payload: sql`excluded.payload`,
      },
    });
}

export async function upsertRemediation(
  tx: DrizzleDb,
  remediation: Remediation,
  options?: UpsertRemediationsOptions,
): Promise<void> {
  await upsertRemediations(tx, [remediation], options);
}