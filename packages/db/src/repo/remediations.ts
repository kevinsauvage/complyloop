import { and, eq, inArray, sql } from "drizzle-orm";

import type { Remediation } from "@complyloop/analysis-core/contract/entities";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "../postgres.ts";
import { findings, remediations } from "../schema.ts";
import { remediationToRow } from "./mappers.ts";
import { type StaleWriteOptions, upsertPayloadRows } from "./upsert-guard.ts";

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

export interface ListRemediationsOptions {
  /**
   * Restrict to remediations whose finding has one of these statuses. Keeps
   * the remediation load consistent with a status-scoped findings load
   * (pages), instead of loading history remediations nothing renders. Omit
   * for all (writes, reports, exports).
   */
  findingStatuses?: readonly FindingStatus[];
}

export async function listRemediationsForProject(
  drizzle: DrizzleDb,
  projectId: string,
  options: ListRemediationsOptions = {},
): Promise<Remediation[]> {
  // Join through findings in one query instead of loading every finding id and
  // passing an unbounded IN list (which grows with history).
  const { findingStatuses } = options;
  const where =
    findingStatuses && findingStatuses.length > 0
      ? and(
          eq(findings.projectId, projectId),
          inArray(findings.status, [...findingStatuses]),
        )
      : eq(findings.projectId, projectId);
  const rows = await drizzle
    .select({ payload: remediations.payload })
    .from(remediations)
    .innerJoin(findings, eq(remediations.findingId, findings.id))
    .where(where);
  return rows.map((row) => row.payload);
}

export async function listRemediationsForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<Remediation[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle
    .select({ payload: remediations.payload })
    .from(remediations)
    .innerJoin(findings, eq(remediations.findingId, findings.id))
    .where(inArray(findings.projectId, [...projectIds]));
  return rows.map((row) => row.payload);
}

export async function upsertRemediations(
  tx: DrizzleDb,
  items: ReadonlyArray<Remediation>,
  options: StaleWriteOptions = {},
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
