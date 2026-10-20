import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import { assessmentJobs } from "../schema.ts";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
} from "../test-fixtures/project-slice-fixture.ts";
import { listPortfolioForProjects } from "./portfolio.ts";
import { insertProject } from "./projects.ts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("portfolio aggregation", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("returns nothing for an empty project list", async () => {
    expect(await listPortfolioForProjects(await getDrizzle(), [])).toEqual([]);
  });

  it("aggregates verdicts, violations, alerts, last assessment and newest job", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-portfolio`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      await drizzle.insert(assessmentJobs).values([
        {
          id: `job-old-${suffix}`,
          projectId: fixture.projectId,
          status: "succeeded",
          trigger: "manual",
          payload: {},
          attempts: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: `job-new-${suffix}`,
          projectId: fixture.projectId,
          status: "failed",
          trigger: "webhook",
          payload: {},
          attempts: 1,
          maxAttempts: 3,
          availableAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ]);

      const [row] = await listPortfolioForProjects(drizzle, [
        fixture.projectId,
      ]);

      expect(row?.projectId).toBe(fixture.projectId);
      // Fixture seeds one failed requirement, two open violation findings, one
      // unread alert and one completed assessment.
      expect(row?.requirements.failed).toBe(1);
      expect(row?.requirements.passed).toBe(0);
      expect(row?.openViolations).toBe(2);
      expect(row?.unreadAlerts).toBe(1);
      expect(row?.lastCompletedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(row?.latestJobStatus).toBe("failed");
      expect(row?.latestJobAt).toBe("2026-01-02T00:00:00.000Z");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("zeroes a project that has no compliance rows yet", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-portfolio-empty`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const emptyProjectId = `proj-empty-${suffix}`;

    try {
      await insertProject(drizzle, {
        id: emptyProjectId,
        name: "Fresh client",
        source: "github",
        orgId: fixture.orgId,
        ownerUserId: fixture.userId,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const rows = await listPortfolioForProjects(drizzle, [
        emptyProjectId,
        fixture.projectId,
      ]);

      // One row per requested id, in request order.
      expect(rows.map((row) => row.projectId)).toEqual([
        emptyProjectId,
        fixture.projectId,
      ]);
      expect(rows[0]).toMatchObject({
        openViolations: 0,
        unreadAlerts: 0,
        lastCompletedAt: null,
        latestJobStatus: null,
        latestJobAt: null,
      });
      expect(rows[0]?.requirements.failed).toBe(0);
      expect(rows[1]?.openViolations).toBe(2);
    } finally {
      // `projects` cascades findings/alerts/requirements and assessment_jobs.
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id = ${emptyProjectId}`,
      );
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});
