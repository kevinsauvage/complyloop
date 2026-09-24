#!/usr/bin/env tsx
/** Fails a deployment/cron check when production operational prerequisites drift. */
import { sql } from "drizzle-orm";

import { getDrizzle } from "@complyloop/db/postgres";

import {
  oldestQueuedAssessmentJobAgeMs,
  queuedAssessmentJobCount,
} from "../src/server/assessment/assessment-jobs";
import {
  DEFAULT_OPS_THRESHOLDS,
  evaluateOpsStatus,
  evidenceBytesFromMb,
} from "../src/server/ops-thresholds";
import { loadLocalEnv } from "./env";

loadLocalEnv();

/**
 * Env the core loop cannot run without. Missing any of these in production
 * fails the check: a silently-missing dispatch token leaves every assessment
 * waiting on the 15-min backstop (or forever, once GitHub disables an idle
 * scheduled workflow), which is the exact failure this check exists to catch.
 * `SENTRY_DSN` is monitoring-only, so it stays a warning.
 */
const REQUIRED_PROD_ENV = [
  "AUTH_SECRET",
  "AUTH_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "GH_WORKER_DISPATCH_TOKEN",
] as const;

const OPTIONAL_PROD_ENV = ["SENTRY_DSN"] as const;

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
  // DATABASE_URL is the only hard requirement for the check to run at all.
  const dbMissing = required("DATABASE_URL");
  if (dbMissing) throw new Error(dbMissing);
  const isProd = process.env.NODE_ENV === "production";
  const envFailures = isProd
    ? REQUIRED_PROD_ENV.map((name) => required(name)).filter(
        (failure): failure is string => Boolean(failure),
      )
    : [];
  const envWarnings = isProd
    ? OPTIONAL_PROD_ENV.map((name) => required(name)).filter(
        (failure): failure is string => Boolean(failure),
      )
    : [];

  const drizzle = await getDrizzle();
  await drizzle.execute(sql`SELECT 1`);
  const queuedJobs = await queuedAssessmentJobCount();
  const oldestQueuedJobAgeMs = await oldestQueuedAssessmentJobAgeMs();

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
    maxQueuedJobAgeMs:
      positiveInt(
        process.env.OPS_MAX_QUEUED_AGE_MINUTES,
        DEFAULT_OPS_THRESHOLDS.maxQueuedJobAgeMs / 60_000,
      ) * 60_000,
    maxEvidenceBytes: evidenceBytesFromMb(
      positiveInt(
        process.env.OPS_MAX_EVIDENCE_MB,
        DEFAULT_OPS_THRESHOLDS.maxEvidenceBytes / 1024 / 1024,
      ),
    ),
  };
  const evaluation = evaluateOpsStatus(
    { queuedJobs, oldestQueuedJobAgeMs, evidenceBytes, evidenceRowsEstimate },
    thresholds,
  );

  console.info(
    JSON.stringify({
      status: evaluation.ok && envFailures.length === 0 ? "ok" : "failing",
      queuedJobs,
      oldestQueuedJobAgeMs,
      evidenceBytes,
      evidenceRowsEstimate,
      thresholds,
      envFailures,
      envWarnings,
      at: new Date().toISOString(),
    }),
  );
  if (envWarnings.length > 0) {
    console.warn(`optional prod env unset: ${envWarnings.join(" ")}`);
  }
  if (envFailures.length > 0) {
    throw new Error(`required prod env missing: ${envFailures.join(" ")}`);
  }
  if (!evaluation.ok) throw new Error(evaluation.failures.join(" "));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
