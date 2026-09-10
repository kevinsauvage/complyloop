import { eq, inArray, sql } from "drizzle-orm";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import { requirements } from "../schema.ts";
import { requirementToRow } from "./mappers.ts";
import { upsertPayloadRows } from "./upsert-guard.ts";

export async function listRequirementsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Requirement[]> {
  const rows = await drizzle
    .select({ payload: requirements.payload })
    .from(requirements)
    .where(eq(requirements.projectId, projectId));
  return rows.map((row) => row.payload);
}

export interface UpsertRequirementsOptions {
  /**
   * Requirement `updatedAt` values from the load that started this write.
   * Rows whose DB copy was updated afterward are skipped so a stale
   * `refreshRequirementStatuses` pass cannot overwrite a newer human decision.
   */
  loadedUpdatedAtById?: ReadonlyMap<string, string>;
}

export async function upsertRequirements(
  tx: DrizzleDb,
  items: ReadonlyArray<Requirement>,
  options: UpsertRequirementsOptions = {},
): Promise<void> {
  await upsertPayloadRows(
    items,
    options.loadedUpdatedAtById,
    async (ids) => {
      const rows = await tx
        .select({ id: requirements.id, payload: requirements.payload })
        .from(requirements)
        .where(inArray(requirements.id, [...ids]));
      return new Map(rows.map((row) => [row.id, row.payload.updatedAt]));
    },
    requirementToRow,
    async (rows) => {
      // Conflict target is the composite unique index, not the id: two writers
      // that each created an in-memory row for the same (project, control) with
      // fresh ids must converge on one DB row instead of inserting a duplicate.
      // Same-id updates hit the same arbiter (same row), so the common status-flip
      // path is unchanged.
      await tx
        .insert(requirements)
        .values(rows)
        .onConflictDoUpdate({
          target: [requirements.projectId, requirements.controlId],
          set: {
            id: sql`excluded.id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        });
    },
  );
}
