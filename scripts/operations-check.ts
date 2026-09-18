#!/usr/bin/env tsx
/** Fails a deployment/cron check when production operational prerequisites drift. */
import { sql } from "drizzle-orm";

import { getDrizzle } from "@complyloop/db/postgres";

import { queuedAssessmentJobCount } from "../src/server/assessment/assessment-jobs";
import {
  DEFAULT_OPS_THRESHOLDS,
  evaluateOpsStatus,
  evidenceBytesFromMb,
} from "../src/server/ops-thresholds";
import { loadLocalEnv } from "./env";

loadLocalEnv();

function required(name: string): string | null {
  return process.env[name]?.trim() ? null : `${name} is required.`;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

async function main(): Promise<void> {
  // DATABASE_URL is the only hard requirement: without it no check can run.
  // Missing prod env vars degrade the report (warn) instead of failing the
  // run — otherwise the daily check fails for a false reason and masks real
  // queue/evidence breaches.
  const dbMissing = required("DATABASE_URL");
  if (dbMissing) throw new Error(dbMissing);
  const envIssues =
    process.env.NODE_ENV === "production"
      ? [
          required("AUTH_SECRET"),
          required("AUTH_URL"),
          required("GITHUB_APP_ID"),
          required("GITHUB_APP_PRIVATE_KEY"),
          required("GITHUB_WEBHOOK_SECRET"),
          required("WORKER_SECRET"),
          required("SENTRY_DSN"),
        ].filter((failure): failure is string => Boolean(failure))
      : [];

  const drizzle = await getDrizzle();
  await drizzle.execute(sql`SELECT 1`);
  const queuedJobs = await queuedAssessmentJobCount();

  // Fast, lock-free size signals: exact byte size + planner row estimate
  // (no COUNT(*) seq scan on an ever-growing append-only table).
  const [stats] = (await drizzle.execute(sql`
    SELECT pg_total_relation_size('evidence')::text AS bytes,
           reltuples::bigint::text AS rows_estimate
      FROM pg_class
     WHERE relname = 'evidence'
  `)) as Array<{ bytes: unknown; rows_estimate: unknown }>;
  const evidenceBytes = toNumber(stats?.bytes);
  const evidenceRowsEstimate = toNumber(stats?.rows_estimate);

  const thresholds = {
    maxQueuedJobs: positiveInt(
      process.env.OPS_MAX_QUEUED_JOBS,
      DEFAULT_OPS_THRESHOLDS.maxQueuedJobs,
    ),
    maxEvidenceBytes: evidenceBytesFromMb(
      positiveInt(
        process.env.OPS_MAX_EVIDENCE_MB,
        DEFAULT_OPS_THRESHOLDS.maxEvidenceBytes / 1024 / 1024,
      ),
    ),
  };
  const evaluation = evaluateOpsStatus(
    { queuedJobs, evidenceBytes, evidenceRowsEstimate },
    thresholds,
  );

  console.info(
    JSON.stringify({
      status: evaluation.ok ? "ok" : "failing",
      queuedJobs,
      evidenceBytes,
      evidenceRowsEstimate,
      thresholds,
      envIssues,
      at: new Date().toISOString(),
    }),
  );
  if (envIssues.length > 0) {
    console.warn(`prod env incomplete: ${envIssues.join(" ")}`);
  }
  if (!evaluation.ok) throw new Error(evaluation.failures.join(" "));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
