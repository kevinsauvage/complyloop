import { inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  alerts,
  assessments,
  evidence,
  findings,
  remediations,
  requirements,
} from "./schema";
import { evidenceRecordsToInsert, evidenceToRow } from "./postgres-evidence";
import { syncPayloadTable } from "./postgres-sync";

export async function persistRuntimeToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  await syncPayloadTable({
    length: db.requirements.length,
    deleteAll: () => tx.delete(requirements),
    upsert: () =>
      tx
        .insert(requirements)
        .values(
          db.requirements.map((item) => ({
            id: item.id,
            projectId: item.projectId,
            controlId: item.controlId,
            status: item.status,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: requirements.id,
          set: {
            projectId: sql`excluded.project_id`,
            controlId: sql`excluded.control_id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        }),
    prune: () =>
      tx.delete(requirements).where(
        notInArray(
          requirements.id,
          db.requirements.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.assessments.length,
    deleteAll: () => tx.delete(assessments),
    upsert: () =>
      tx
        .insert(assessments)
        .values(
          db.assessments.map((item) => ({
            id: item.id,
            projectId: item.projectId,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: assessments.id,
          set: {
            projectId: sql`excluded.project_id`,
            payload: sql`excluded.payload`,
          },
        }),
    prune: () =>
      tx.delete(assessments).where(
        notInArray(
          assessments.id,
          db.assessments.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.findings.length,
    deleteAll: () => tx.delete(findings),
    upsert: () =>
      tx
        .insert(findings)
        .values(
          db.findings.map((item) => ({
            id: item.id,
            projectId: item.projectId,
            controlId: item.controlId,
            assessmentId: item.assessmentId,
            status: item.status,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: findings.id,
          set: {
            projectId: sql`excluded.project_id`,
            controlId: sql`excluded.control_id`,
            assessmentId: sql`excluded.assessment_id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        }),
    prune: () =>
      tx.delete(findings).where(
        notInArray(
          findings.id,
          db.findings.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.remediations.length,
    deleteAll: () => tx.delete(remediations),
    upsert: () =>
      tx
        .insert(remediations)
        .values(
          db.remediations.map((item) => ({
            id: item.id,
            findingId: item.findingId,
            status: item.status,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: remediations.id,
          set: {
            findingId: sql`excluded.finding_id`,
            status: sql`excluded.status`,
            payload: sql`excluded.payload`,
          },
        }),
    prune: () =>
      tx.delete(remediations).where(
        notInArray(
          remediations.id,
          db.remediations.map((item) => item.id),
        ),
      ),
  });

  await syncPayloadTable({
    length: db.alerts.length,
    deleteAll: () => tx.delete(alerts),
    upsert: () =>
      tx
        .insert(alerts)
        .values(
          db.alerts.map((item) => ({
            id: item.id,
            projectId: item.projectId,
            read: item.read,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: alerts.id,
          set: {
            projectId: sql`excluded.project_id`,
            read: sql`excluded.read`,
            payload: sql`excluded.payload`,
          },
        }),
    prune: () =>
      tx.delete(alerts).where(
        notInArray(
          alerts.id,
          db.alerts.map((item) => item.id),
        ),
      ),
  });

  // Evidence: append-only — insert missing ids, never update or delete.
  if (db.evidence.length > 0) {
    const existing = await tx
      .select({ id: evidence.id })
      .from(evidence)
      .where(
        inArray(
          evidence.id,
          db.evidence.map((record) => record.id),
        ),
      );
    const existingIds = new Set(existing.map((row) => row.id));
    const fresh = evidenceRecordsToInsert(db.evidence, existingIds);
    if (fresh.length > 0) {
      await tx.insert(evidence).values(fresh.map(evidenceToRow));
    }
  }
}
