import { and, inArray, notInArray, sql } from "drizzle-orm";
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
import { fullLoadScope, isFullLoadScope } from "./postgres-scope";
import { syncPayloadTable } from "./postgres-sync";

function keepIdsOrNeverMatch(ids: readonly string[]): string[] {
  return ids.length > 0 ? [...ids] : ["__none__"];
}

export async function persistRuntimeToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  const scope = db.loadScope ?? fullLoadScope();
  const projectIds = isFullLoadScope(scope) ? null : [...scope.projectIds];

  await syncPayloadTable({
    length: db.requirements.length,
    deleteAll: () =>
      projectIds
        ? projectIds.length === 0
          ? Promise.resolve()
          : tx
              .delete(requirements)
              .where(inArray(requirements.projectId, projectIds))
        : tx.delete(requirements),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.requirements.map((item) => item.id));
      if (!projectIds) {
        return tx.delete(requirements).where(notInArray(requirements.id, keep));
      }
      if (projectIds.length === 0) return Promise.resolve();
      return tx
        .delete(requirements)
        .where(
          and(
            inArray(requirements.projectId, projectIds),
            notInArray(requirements.id, keep),
          ),
        );
    },
  });

  await syncPayloadTable({
    length: db.assessments.length,
    deleteAll: () =>
      projectIds
        ? projectIds.length === 0
          ? Promise.resolve()
          : tx
              .delete(assessments)
              .where(inArray(assessments.projectId, projectIds))
        : tx.delete(assessments),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.assessments.map((item) => item.id));
      if (!projectIds) {
        return tx.delete(assessments).where(notInArray(assessments.id, keep));
      }
      if (projectIds.length === 0) return Promise.resolve();
      return tx
        .delete(assessments)
        .where(
          and(
            inArray(assessments.projectId, projectIds),
            notInArray(assessments.id, keep),
          ),
        );
    },
  });

  await syncPayloadTable({
    length: db.findings.length,
    deleteAll: () =>
      projectIds
        ? projectIds.length === 0
          ? Promise.resolve()
          : tx.delete(findings).where(inArray(findings.projectId, projectIds))
        : tx.delete(findings),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.findings.map((item) => item.id));
      if (!projectIds) {
        return tx.delete(findings).where(notInArray(findings.id, keep));
      }
      if (projectIds.length === 0) return Promise.resolve();
      return tx
        .delete(findings)
        .where(
          and(
            inArray(findings.projectId, projectIds),
            notInArray(findings.id, keep),
          ),
        );
    },
  });

  await syncPayloadTable({
    length: db.remediations.length,
    deleteAll: async () => {
      if (!projectIds) {
        await tx.delete(remediations);
        return;
      }
      if (projectIds.length === 0) return;
      const scopedFindings = await tx
        .select({ id: findings.id })
        .from(findings)
        .where(inArray(findings.projectId, projectIds));
      const findingIds = scopedFindings.map((row) => row.id);
      if (findingIds.length === 0) return;
      await tx
        .delete(remediations)
        .where(inArray(remediations.findingId, findingIds));
    },
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
    prune: async () => {
      const keep = keepIdsOrNeverMatch(db.remediations.map((item) => item.id));
      if (!projectIds) {
        await tx.delete(remediations).where(notInArray(remediations.id, keep));
        return;
      }
      if (projectIds.length === 0) return;
      const scopedFindings = await tx
        .select({ id: findings.id })
        .from(findings)
        .where(inArray(findings.projectId, projectIds));
      const findingIds = scopedFindings.map((row) => row.id);
      if (findingIds.length === 0) return;
      await tx
        .delete(remediations)
        .where(
          and(
            inArray(remediations.findingId, findingIds),
            notInArray(remediations.id, keep),
          ),
        );
    },
  });

  await syncPayloadTable({
    length: db.alerts.length,
    deleteAll: () =>
      projectIds
        ? projectIds.length === 0
          ? Promise.resolve()
          : tx.delete(alerts).where(inArray(alerts.projectId, projectIds))
        : tx.delete(alerts),
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
    prune: () => {
      const keep = keepIdsOrNeverMatch(db.alerts.map((item) => item.id));
      if (!projectIds) {
        return tx.delete(alerts).where(notInArray(alerts.id, keep));
      }
      if (projectIds.length === 0) return Promise.resolve();
      return tx
        .delete(alerts)
        .where(
          and(
            inArray(alerts.projectId, projectIds),
            notInArray(alerts.id, keep),
          ),
        );
    },
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
