import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import {
  isOneOf,
  zeroCounts,
} from "@complyloop/analysis-core/contract/literal-sets";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "../postgres.ts";
import {
  alerts,
  assessmentJobs,
  assessments,
  findings,
  requirements,
} from "../schema.ts";

/**
 * One row per project for the org portfolio. Everything here is an aggregate:
 * the overview must cost one grouped query per metric, not a runtime load per
 * project (a project's history grows without bound).
 */
export interface PortfolioProjectRow {
  projectId: string;
  /** Requirement verdicts, keyed by status (absent = 0). */
  requirements: Record<RequirementStatus, number>;
  /** Open findings whose `kind` blocks the requirement (`violation`). */
  openViolations: number;
  unreadAlerts: number;
  /** Newest completed assessment; null = never assessed. */
  lastCompletedAt: string | null;
  /** Newest job for the project (any status), for the pipeline column. */
  latestJobStatus: string | null;
  latestJobAt: string | null;
}

/**
 * `timestamptz` in string mode comes back as the server's own text form
 * (`2026-01-01 01:00:00+01`), not ISO. The portfolio hands these to the UI and
 * sorts them as strings, so normalise to ISO-8601 UTC — the app's timestamp
 * form — instead of leaking the database timezone.
 */
function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Portfolio rows for a set of projects, in one pass of grouped queries.
 * Projects with no rows yet still get a row (zeros / nulls) so the caller can
 * render "never assessed" instead of dropping the project from the list.
 *
 * `scopes` holds each project's preset control ids: requirement and violation
 * counts only cover those controls, like every other view of the project.
 * Rows from controls a preset change left behind are not counted. A project
 * without an entry counts the whole catalog.
 */
export async function listPortfolioForProjects(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
  scopes: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Promise<PortfolioProjectRow[]> {
  if (projectIds.length === 0) return [];
  const ids = [...projectIds];
  const inScope = (projectId: string, controlId: string) =>
    scopes.get(projectId)?.has(controlId) ?? true;

  const [
    requirementRows,
    openViolationRows,
    alertRows,
    assessmentRows,
    jobRows,
  ] = await Promise.all([
    drizzle
      .select({
        projectId: requirements.projectId,
        controlId: requirements.controlId,
        status: requirements.status,
        value: count(),
      })
      .from(requirements)
      .where(inArray(requirements.projectId, ids))
      .groupBy(
        requirements.projectId,
        requirements.controlId,
        requirements.status,
      ),
    drizzle
      .select({
        projectId: findings.projectId,
        controlId: findings.controlId,
        value: count(),
      })
      .from(findings)
      .where(
        and(
          inArray(findings.projectId, ids),
          eq(findings.status, "open"),
          eq(findings.kind, "violation"),
        ),
      )
      .groupBy(findings.projectId, findings.controlId),
    drizzle
      .select({ projectId: alerts.projectId, value: count() })
      .from(alerts)
      .where(and(inArray(alerts.projectId, ids), eq(alerts.read, false)))
      .groupBy(alerts.projectId),
    // Newest completed run per project. `max()` would hand back the driver's
    // own timestamp text; selecting the typed column keeps the ISO string the
    // rest of the app reads. `NULLS LAST` matters: Postgres sorts DESC with
    // nulls first, and an in-flight assessment has `completed_at` null.
    drizzle
      .selectDistinctOn([assessments.projectId], {
        projectId: assessments.projectId,
        completedAt: assessments.completedAt,
      })
      .from(assessments)
      .where(inArray(assessments.projectId, ids))
      .orderBy(
        assessments.projectId,
        sql`${assessments.completedAt} DESC NULLS LAST`,
        sql`${assessments.startedAt} DESC NULLS LAST`,
        desc(assessments.id),
      ),
    // Newest job per project without a per-project round trip.
    drizzle
      .selectDistinctOn([assessmentJobs.projectId], {
        projectId: assessmentJobs.projectId,
        status: assessmentJobs.status,
        updatedAt: assessmentJobs.updatedAt,
      })
      .from(assessmentJobs)
      .where(inArray(assessmentJobs.projectId, ids))
      .orderBy(
        assessmentJobs.projectId,
        desc(assessmentJobs.updatedAt),
        desc(assessmentJobs.id),
      ),
  ]);

  const byProject = new Map<string, PortfolioProjectRow>(
    ids.map((projectId) => [
      projectId,
      {
        projectId,
        requirements: zeroCounts(REQUIREMENT_STATUSES),
        openViolations: 0,
        unreadAlerts: 0,
        lastCompletedAt: null,
        latestJobStatus: null,
        latestJobAt: null,
      },
    ]),
  );

  for (const row of requirementRows) {
    const entry = byProject.get(row.projectId);
    if (!entry || !inScope(row.projectId, row.controlId)) continue;
    if (isOneOf(REQUIREMENT_STATUSES, row.status)) {
      entry.requirements[row.status] += Number(row.value ?? 0);
    }
  }
  for (const row of openViolationRows) {
    const entry = byProject.get(row.projectId);
    if (!entry || !inScope(row.projectId, row.controlId)) continue;
    entry.openViolations += Number(row.value ?? 0);
  }
  for (const row of alertRows) {
    const entry = byProject.get(row.projectId);
    if (entry) entry.unreadAlerts = Number(row.value ?? 0);
  }
  for (const row of assessmentRows) {
    const entry = byProject.get(row.projectId);
    if (entry) entry.lastCompletedAt = isoOrNull(row.completedAt);
  }
  for (const row of jobRows) {
    const entry = byProject.get(row.projectId);
    if (!entry) continue;
    entry.latestJobStatus = row.status;
    entry.latestJobAt = isoOrNull(row.updatedAt);
  }

  return ids.map((projectId) => byProject.get(projectId)!);
}
