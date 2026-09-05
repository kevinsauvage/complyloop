#!/usr/bin/env tsx
/** Fails a deployment/cron check when production operational prerequisites drift. */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { getDrizzle } from "@complyloop/db/client";
import { queuedAssessmentJobCount } from "../src/server/assessment-jobs";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

function required(name: string): string | null {
  return process.env[name]?.trim() ? null : `${name} is required.`;
}

async function main(): Promise<void> {
  const failures = [required("DATABASE_URL")];
  if (process.env.NODE_ENV === "production") {
    failures.push(
      required("AUTH_SECRET"),
      required("SENTRY_DSN"),
      required("GITHUB_WEBHOOK_SECRET"),
    );
  }
  const missing = failures.filter((failure): failure is string => Boolean(failure));
  if (missing.length > 0) throw new Error(missing.join(" "));

  const drizzle = await getDrizzle();
  await drizzle.execute(sql`SELECT 1`);
  const queuedJobs = await queuedAssessmentJobCount();
  console.info(JSON.stringify({ status: "ok", queuedJobs, at: new Date().toISOString() }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
