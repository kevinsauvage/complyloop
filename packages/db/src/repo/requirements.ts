import { eq, inArray, sql } from "drizzle-orm";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import type { DrizzleDb } from "../postgres.ts";
import { requirements } from "../schema.ts";
import { requirementToRow } from "./mappers.ts";
import { type StaleWriteOptions, upsertPayloadRows } from "./upsert-guard.ts";

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

export async function listRequirementsForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<Requirement[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: requirements.payload })
    .from(requirements)
    .where(inArray(requirements.projectId, [...projectIds]));
  return rows.map((row) => row.payload);
}

export async function upsertRequirements(
  tx: DrizzleDb,
  items: ReadonlyArray<Requirement>,
  options: StaleWriteOptions = {},
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
