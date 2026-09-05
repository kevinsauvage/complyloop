import { inArray, sql } from "drizzle-orm";
import type { Requirement } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "../client.ts";
import { requirements } from "../schema.ts";
import { requirementToRow } from "./mappers.ts";

export interface UpsertRequirementsOptions {
  /**
   * Requirement `updatedAt` values from the load that started this write.
   * Rows whose DB copy was updated afterward are skipped so a stale
   * `refreshRequirementStatuses` pass cannot overwrite a newer human decision.
   */
  loadedUpdatedAtById?: ReadonlyMap<string, string>;
}

function filterRequirementsNotStaleInDb(
  items: ReadonlyArray<Requirement>,
  loadedUpdatedAtById: ReadonlyMap<string, string>,
  dbUpdatedAtById: ReadonlyMap<string, string>,
): Requirement[] {
  return items.filter((item) => {
    const loadedAt = loadedUpdatedAtById.get(item.id);
    const dbUpdatedAt = dbUpdatedAtById.get(item.id);
    if (!loadedAt || !dbUpdatedAt) return true;
    return Date.parse(dbUpdatedAt) <= Date.parse(loadedAt);
  });
}

export async function upsertRequirements(
  tx: DrizzleDb,
  items: ReadonlyArray<Requirement>,
  options: UpsertRequirementsOptions = {},
): Promise<void> {
  if (items.length === 0) return;

  let toWrite = items;
  const { loadedUpdatedAtById } = options;
  if (loadedUpdatedAtById && loadedUpdatedAtById.size > 0) {
    const ids = items.map((item) => item.id);
    const rows = await tx
      .select({ id: requirements.id, payload: requirements.payload })
      .from(requirements)
      .where(inArray(requirements.id, ids));
    const dbUpdatedAtById = new Map(
      rows.map((row) => [row.id, row.payload.updatedAt]),
    );
    toWrite = filterRequirementsNotStaleInDb(
      items,
      loadedUpdatedAtById,
      dbUpdatedAtById,
    );
  }

  if (toWrite.length === 0) return;
  await tx
    .insert(requirements)
    .values(toWrite.map(requirementToRow))
    .onConflictDoUpdate({
      target: requirements.id,
      set: {
        projectId: sql`excluded.project_id`,
        controlId: sql`excluded.control_id`,
        status: sql`excluded.status`,
        payload: sql`excluded.payload`,
      },
    });
}
