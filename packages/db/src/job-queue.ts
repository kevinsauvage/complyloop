import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss, type Queue } from "pg-boss";

import type { DrizzleDb } from "./postgres.ts";

type QueueDb = Pick<DrizzleDb, "execute">;

/** pg-boss queue that carries every assessment job (all triggers). */
export const ASSESSMENT_QUEUE = "assessment";

export const ASSESSMENT_JOB_RETENTION_DAYS = 30;

/**
 * One run of a scan stays well below `expireInSeconds` (the drain stops
 * claiming after 20 minutes); a worker that dies is caught sooner by the
 * missed heartbeat. Retries back off from 30s: attempt 2 after 30s, 3 after 60s.
 */
export const ASSESSMENT_QUEUE_OPTIONS = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60 * 60,
  heartbeatSeconds: 15 * 60,
  deleteAfterSeconds: ASSESSMENT_JOB_RETENTION_DAYS * 24 * 60 * 60,
} satisfies Omit<Queue, "name" | "policy">;

/**
 * pg-boss's Drizzle adapter hands raw `Date` and object parameters to
 * postgres.js, which rejects them (pg-boss 12.39): serialize them first.
 */
export function jobQueueDb(db: QueueDb) {
  const inner = fromDrizzle(db, sql);
  return {
    executeSql: (text: string, values?: unknown[]) =>
      inner.executeSql(
        text,
        values?.map((value) =>
          value instanceof Date
            ? value.toISOString()
            : value !== null &&
                typeof value === "object" &&
                !Array.isArray(value)
              ? JSON.stringify(value)
              : value,
        ),
      ),
  };
}

/**
 * A pg-boss client that is never started: every call is a plain query on the
 * app's own connection (no second pool, no background timers), so it is safe
 * in a serverless function. Maintenance runs on demand through `supervise`.
 */
export function createJobQueue(db: QueueDb): PgBoss {
  return new PgBoss({
    db: jobQueueDb(db),
    migrate: false,
    supervise: false,
    schedule: false,
    createSchema: false,
  });
}

/**
 * Installs or upgrades the `pgboss` schema and the assessment queue. Called by
 * `db:migrate` after the SQL files; pg-boss versions its own schema.
 */
export async function installJobQueue(db: QueueDb): Promise<void> {
  const boss = new PgBoss({
    db: jobQueueDb(db),
    supervise: false,
    schedule: false,
  });
  await boss.start();
  try {
    const existing = await boss.getQueue(ASSESSMENT_QUEUE);
    if (existing) {
      await boss.updateQueue(ASSESSMENT_QUEUE, ASSESSMENT_QUEUE_OPTIONS);
    } else {
      await boss.createQueue(ASSESSMENT_QUEUE, ASSESSMENT_QUEUE_OPTIONS);
    }
    // Dashboard and portfolio reads filter by project; pg-boss indexes none of
    // the job data.
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS job_common_project_idx
        ON pgboss.job_common ((data->>'projectId'), created_on)
    `);
  } finally {
    await boss.stop({ graceful: false, close: false });
  }
}
