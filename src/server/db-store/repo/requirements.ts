import { sql } from "drizzle-orm";
import type { Requirement } from "@/core/project-types";
import type { DrizzleDb } from "../client";
import { requirements } from "../schema";
import { requirementToRow } from "./mappers";

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
