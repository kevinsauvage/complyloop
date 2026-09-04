import { sql } from "drizzle-orm";
import type { Finding } from "@/core/finding-types";
import type { DrizzleDb } from "../client";
import { findings } from "../schema";
import { findingToRow } from "./mappers";

export async function upsertFindings(
  tx: DrizzleDb,
  items: ReadonlyArray<Finding>,
): Promise<void> {
  if (items.length === 0) return;
  await tx
    .insert(findings)
    .values(items.map(findingToRow))
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
): Promise<void> {
  await upsertFindings(tx, [finding]);
}
