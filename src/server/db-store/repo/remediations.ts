import { sql } from "drizzle-orm";
import type { Remediation } from "@/core/finding-types";
import type { DrizzleDb } from "../client";
import { remediations } from "../schema";
import { remediationToRow } from "./mappers";

export async function upsertRemediations(
  tx: DrizzleDb,
  items: ReadonlyArray<Remediation>,
): Promise<void> {
  if (items.length === 0) return;
  await tx
    .insert(remediations)
    .values(items.map(remediationToRow))
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
): Promise<void> {
  await upsertRemediations(tx, [remediation]);
}
