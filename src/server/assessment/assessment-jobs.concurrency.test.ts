import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "@complyloop/db/postgres";

import {
  claimNextAssessmentJob,
  enqueueAssessmentJob,
} from "./assessment-jobs";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Regression tests for serial-per-project execution: the claim-time NOT
 * EXISTS guard cannot see a concurrent uncommitted `running` row under READ
 * COMMITTED, so the partial unique index
 * (`assessment_jobs_running_project_uidx`, drizzle/0001) is the backstop —
 * the losing claim gets 23505 and returns null instead of double-scanning.
 */
describe.skipIf(!enabled)("assessment job serial claim concurrency", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("grants only one running job per project under concurrent claims", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-serial`;
    const orgId = `org-serial-${suffix}`;
    const projectId = `proj-serial-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-serial-${suffix}`}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (${projectId}, 'serial-fixture', ${`user-${suffix}`}, ${orgId}, '{}'::jsonb)
    `);

    try {
      await enqueueAssessmentJob({ projectId, trigger: "manual" });
      await enqueueAssessmentJob({
        projectId,
        trigger: "webhook",
        payload: { ref: "refs/heads/main", eventName: "push" },
      });

      const [first, second] = await Promise.all([
        claimNextAssessmentJob(),
        claimNextAssessmentJob(),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);

      const running = await drizzle.execute(sql`
        SELECT id FROM assessment_jobs
        WHERE project_id = ${projectId} AND status = 'running'
      `);
      expect(running.length).toBe(1);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM assessment_jobs WHERE project_id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id = ${orgId}`,
      );
    }
  });

  it("terminal-fails malformed payloads instead of scanning", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-malformed`;
    const orgId = `org-malformed-${suffix}`;
    const projectId = `proj-malformed-${suffix}`;
    const jobId = `job-malformed-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-malformed-${suffix}`}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (${projectId}, 'malformed-fixture', ${`user-${suffix}`}, ${orgId}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO assessment_jobs
        (id, project_id, status, trigger, payload, attempts, max_attempts, available_at, created_at, updated_at)
      VALUES
        (${jobId}, ${projectId}, 'queued', 'webhook', '"corrupt"'::jsonb, 0, 3, NOW(), NOW(), NOW())
    `);

    try {
      // Fail closed: no worker ever sees this row as an authoritative scan.
      expect(await claimNextAssessmentJob()).toBeNull();

      const rows = (await drizzle.execute(sql`
        SELECT status, error FROM assessment_jobs WHERE id = ${jobId}
      `)) as Array<{ status: string; error: string | null }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("failed");
      expect(rows[0]?.error).toMatch(/malformed job payload/i);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM assessment_jobs WHERE project_id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id = ${orgId}`,
      );
    }
  });
});
