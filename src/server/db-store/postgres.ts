import { asc, inArray, notInArray, sql } from "drizzle-orm";
import type { EvidenceRecord } from "@/core/types";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  alerts,
  appMeta,
  assessments,
  controls,
  evidence,
  findings,
  frameworks,
  memberships,
  organizations,
  projects,
  remediations,
  requirements,
} from "./schema";

const ACTIVE_PROJECT_KEY = "activeProjectId";

function evidenceToRow(record: EvidenceRecord) {
  return {
    id: record.id,
    at: record.at,
    kind: record.kind,
    summary: record.summary,
    projectId: record.projectId ?? null,
    controlId: record.controlId ?? null,
    findingId: record.findingId ?? null,
    assessmentId: record.assessmentId ?? null,
    detail: record.detail ?? null,
  };
}

/** Evidence ids present in memory but not yet in Postgres (append-only insert set). */
export function evidenceRecordsToInsert(
  records: ReadonlyArray<EvidenceRecord>,
  existingIds: ReadonlySet<string>,
): EvidenceRecord[] {
  return records.filter((record) => !existingIds.has(record.id));
}

function rowToEvidence(
  row: typeof evidence.$inferSelect,
): EvidenceRecord {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as EvidenceRecord["kind"],
    summary: row.summary,
    projectId: row.projectId ?? undefined,
    controlId: row.controlId ?? undefined,
    findingId: row.findingId ?? undefined,
    assessmentId: row.assessmentId ?? undefined,
    detail: row.detail ?? undefined,
  };
}

export async function loadDbFromPostgres(drizzle: DrizzleDb): Promise<Db> {
  const [
    frameworkRows,
    controlRows,
    organizationRows,
    membershipRows,
    projectRows,
    requirementRows,
    assessmentRows,
    findingRows,
    remediationRows,
    evidenceRows,
    alertRows,
    metaRows,
  ] = await Promise.all([
    drizzle.select().from(frameworks),
    drizzle.select().from(controls),
    drizzle.select().from(organizations),
    drizzle.select().from(memberships),
    drizzle.select().from(projects),
    drizzle.select().from(requirements),
    drizzle.select().from(assessments),
    drizzle.select().from(findings),
    drizzle.select().from(remediations),
    drizzle.select().from(evidence).orderBy(asc(evidence.at)),
    drizzle.select().from(alerts),
    drizzle.select().from(appMeta),
  ]);

  const activeMeta = metaRows.find((row) => row.key === ACTIVE_PROJECT_KEY);
  let activeProjectId: string | null = null;
  if (activeMeta) {
    const value = activeMeta.value;
    if (typeof value === "string") activeProjectId = value;
    else if (value === null) activeProjectId = null;
  }

  return {
    frameworks: frameworkRows.map((row) => row.payload),
    controls: controlRows.map((row) => row.payload),
    organizations: organizationRows.map((row) => row.payload),
    memberships: membershipRows.map((row) => row.payload),
    projects: projectRows.map((row) => row.payload),
    activeProjectId,
    requirements: requirementRows.map((row) => row.payload),
    assessments: assessmentRows.map((row) => row.payload),
    findings: findingRows.map((row) => row.payload),
    remediations: remediationRows.map((row) => row.payload),
    evidence: evidenceRows.map(rowToEvidence),
    alerts: alertRows.map((row) => row.payload),
  };
}

/**
 * Replaces mutable collections; evidence is insert-only (never updated/deleted).
 */
export async function saveDbToPostgres(
  drizzle: DrizzleDb,
  db: Db,
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    // Frameworks
    if (db.frameworks.length === 0) {
      await tx.delete(frameworks);
    } else {
      await tx
        .insert(frameworks)
        .values(
          db.frameworks.map((item) => ({ id: item.id, payload: item })),
        )
        .onConflictDoUpdate({
          target: frameworks.id,
          set: { payload: sql`excluded.payload` },
        });
      await tx.delete(frameworks).where(
        notInArray(
          frameworks.id,
          db.frameworks.map((item) => item.id),
        ),
      );
    }

    // Controls
    if (db.controls.length === 0) {
      await tx.delete(controls);
    } else {
      await tx
        .insert(controls)
        .values(
          db.controls.map((item) => ({
            id: item.id,
            frameworkId: item.frameworkId,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: controls.id,
          set: {
            frameworkId: sql`excluded.framework_id`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(controls).where(
        notInArray(
          controls.id,
          db.controls.map((item) => item.id),
        ),
      );
    }

    // Organizations
    if (db.organizations.length === 0) {
      await tx.delete(organizations);
    } else {
      await tx
        .insert(organizations)
        .values(
          db.organizations.map((item) => ({
            id: item.id,
            slug: item.slug,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: organizations.id,
          set: {
            slug: sql`excluded.slug`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(organizations).where(
        notInArray(
          organizations.id,
          db.organizations.map((item) => item.id),
        ),
      );
    }

    // Memberships
    if (db.memberships.length === 0) {
      await tx.delete(memberships);
    } else {
      await tx
        .insert(memberships)
        .values(
          db.memberships.map((item) => ({
            id: item.id,
            orgId: item.orgId,
            userId: item.userId ?? null,
            githubLogin: item.githubLogin,
            role: item.role,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: memberships.id,
          set: {
            orgId: sql`excluded.org_id`,
            userId: sql`excluded.user_id`,
            githubLogin: sql`excluded.github_login`,
            role: sql`excluded.role`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(memberships).where(
        notInArray(
          memberships.id,
          db.memberships.map((item) => item.id),
        ),
      );
    }

    // Projects
    if (db.projects.length === 0) {
      await tx.delete(projects);
    } else {
      await tx
        .insert(projects)
        .values(
          db.projects.map((item) => ({
            id: item.id,
            name: item.name,
            ownerUserId: item.ownerUserId ?? null,
            orgId: item.orgId ?? null,
            payload: item,
          })),
        )
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            name: sql`excluded.name`,
            ownerUserId: sql`excluded.owner_user_id`,
            orgId: sql`excluded.org_id`,
            payload: sql`excluded.payload`,
          },
        });
      await tx.delete(projects).where(
        notInArray(
          projects.id,
          db.projects.map((item) => item.id),
        ),
      );
    }

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
  });
}
