-- Durable assessment queue and cross-instance rate-limit windows.
CREATE TABLE IF NOT EXISTS "assessment_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "trigger" text NOT NULL,
  "requested_by_user_id" text,
  "idempotency_key" text,
  "payload" jsonb NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "available_at" timestamptz NOT NULL,
  "started_at" timestamptz,
  "lease_expires_at" timestamptz,
  "completed_at" timestamptz,
  "error" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "assessment_jobs_status_check"
    CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "assessment_jobs_trigger_check"
    CHECK ("trigger" IN ('manual', 'webhook'))
);

CREATE INDEX IF NOT EXISTS "assessment_jobs_ready_idx"
  ON "assessment_jobs" ("status", "available_at");
CREATE INDEX IF NOT EXISTS "assessment_jobs_project_idx"
  ON "assessment_jobs" ("project_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_jobs_idempotency_uidx"
  ON "assessment_jobs" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "count" integer NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0)
);
