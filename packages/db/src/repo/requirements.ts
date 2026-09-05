import { sql } from "drizzle-orm";
import type { Requirement } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "../client.ts";
import { requirements } from "../schema.ts";
import { requirementToRow } from "./mappers.ts";

export async function upsertRequirements(
  tx: DrizzleDb,
  items: ReadonlyArray<Requirement>,
): Promise<void> {
  if (items.length === 0) return;
  await tx
    .insert(requirements)
    .values(items.map(requirementToRow))
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
