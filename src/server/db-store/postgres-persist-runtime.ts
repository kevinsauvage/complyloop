import { inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  alerts,
  appMeta,
  assessments,
  evidence,
  findings,
  remediations,
  requirements,
} from "./schema";
import { evidenceRecordsToInsert, evidenceToRow } from "./postgres-evidence";
import { ACTIVE_PROJECT_KEY } from "./postgres-meta";

export async function persistRuntimeToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
    // Requirements
    if (db.requirements.length === 0) {
      await tx.delete(requirements);
    } else {
      await tx
        .insert(requirements)
        .values(
          db.requirements.map((item) => ({
            id: item.id,
            projectId: item.projectId,
            controlId: item.controlId,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: requirements.id,
          set: {
            projectId: sql`excluded.project_id`,
            controlId: sql`excluded.control_id`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(requirements).where(
        notInArray(
          requirements.id,
          db.requirements.map((item) => item.id),
        ),
      );
    }

    // Assessments
    if (db.assessments.length === 0) {
      await tx.delete(assessments);
    } else {
      await tx
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
        });
      await tx.delete(assessments).where(
        notInArray(
          assessments.id,
          db.assessments.map((item) => item.id),
        ),
      );
    }

    // Findings
    if (db.findings.length === 0) {
      await tx.delete(findings);
    } else {
      await tx
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
        });
      await tx.delete(findings).where(
        notInArray(
          findings.id,
          db.findings.map((item) => item.id),
        ),
      );
    }

    // Remediations
    if (db.remediations.length === 0) {
      await tx.delete(remediations);
    } else {
      await tx
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
        });
      await tx.delete(remediations).where(
        notInArray(
          remediations.id,
          db.remediations.map((item) => item.id),
        ),
      );
    }

    // Alerts
    if (db.alerts.length === 0) {
      await tx.delete(alerts);
    } else {
      await tx
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
        });
      await tx.delete(alerts).where(
        notInArray(
          alerts.id,
          db.alerts.map((item) => item.id),
        ),
      );
    }

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

    await tx
      .insert(appMeta)
      .values({
        key: ACTIVE_PROJECT_KEY,
        value: db.activeProjectId,
      })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value: sql`excluded.value` },
      });
}
