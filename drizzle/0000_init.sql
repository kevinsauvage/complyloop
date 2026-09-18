-- ComplyLoop Postgres schema (pre-launch single migration).
-- Squashed: this is the authoritative current schema. The app is pre-launch, so
-- there are no incremental migrations — reset and re-run instead of upgrading.
-- Evidence is append-only (no FKs) so history survives project/org deletion.
-- Mutable tables use ON DELETE CASCADE for scoped persist prune.

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_uidx" ON "organizations" ("slug");

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id" text,
  "github_login" text NOT NULL,
  "role" text NOT NULL,
  "payload" jsonb NOT NULL,
  CONSTRAINT "memberships_role_check"
    CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS "memberships_org_id_idx" ON "memberships" ("org_id");
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_github_login_idx" ON "memberships" ("github_login");

-- Login lookup without an org (`lower(github_login) = $1`) cannot use the
-- composite (org_id, lower(...)) unique index.
CREATE INDEX IF NOT EXISTS "memberships_github_login_lower_idx"
  ON "memberships" (lower("github_login"));

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_user_uidx"
  ON "memberships" ("org_id", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_login_uidx"
  ON "memberships" ("org_id", lower("github_login"));

CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "owner_user_id" text,
  "org_id" text NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "projects_org_id_idx" ON "projects" ("org_id");

-- Webhook path looks up a repo by lower(fullName) with no org_id.
CREATE INDEX IF NOT EXISTS "projects_github_fullname_lower_idx"
  ON "projects" (lower(("payload"->'github'->>'fullName')));

CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_github_uidx"
  ON "projects" ("org_id", lower(("payload"->'github'->>'fullName')))
  WHERE "payload"->'github'->>'fullName' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Domain (mutable, project-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "requirements" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "control_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  CONSTRAINT "requirements_status_check"
    CHECK ("status" IN ('passed', 'failed', 'needs_review', 'not_applicable', 'unable_to_verify'))
);

CREATE INDEX IF NOT EXISTS "requirements_project_status_idx"
  ON "requirements" ("project_id", "status");

-- One requirement row per (project, control). The upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS "requirements_project_control_uidx"
  ON "requirements" ("project_id", "control_id");

CREATE TABLE IF NOT EXISTS "assessments" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "assessments_project_id_idx" ON "assessments" ("project_id");

-- Latest-per-project ordering; the app always sorts by completedAt/startedAt.
CREATE INDEX IF NOT EXISTS "assessments_project_completed_idx"
  ON "assessments" ("project_id", (payload->>'completedAt') DESC, (payload->>'startedAt') DESC);

CREATE TABLE IF NOT EXISTS "assessment_snapshots" (
  "assessment_id" text PRIMARY KEY NOT NULL REFERENCES "assessments" ("id") ON DELETE CASCADE,
  "snapshot" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "findings" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "control_id" text NOT NULL,
  "assessment_id" text NOT NULL REFERENCES "assessments" ("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  CONSTRAINT "findings_status_check"
    CHECK ("status" IN ('open', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS "findings_project_status_idx"
  ON "findings" ("project_id", "status");

CREATE INDEX IF NOT EXISTS "findings_project_assessment_idx"
  ON "findings" ("project_id", "assessment_id");

CREATE TABLE IF NOT EXISTS "remediations" (
  "id" text PRIMARY KEY NOT NULL,
  "finding_id" text NOT NULL REFERENCES "findings" ("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  CONSTRAINT "remediations_status_check"
    CHECK ("status" IN ('detected', 'suggested', 'approved', 'implemented', 'verified'))
);

CREATE INDEX IF NOT EXISTS "remediations_finding_id_idx" ON "remediations" ("finding_id");

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "read" boolean DEFAULT false NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "alerts_project_id_idx" ON "alerts" ("project_id");

-- Nav attention counts unread alerts per project on every page.
CREATE INDEX IF NOT EXISTS "alerts_project_unread_idx"
  ON "alerts" ("project_id") WHERE "read" = false;

-- ---------------------------------------------------------------------------
-- Evidence (append-only; intentionally no foreign keys)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "at" timestamptz NOT NULL,
  "kind" text NOT NULL,
  "summary" text NOT NULL,
  "project_id" text,
  "control_id" text,
  "finding_id" text,
  "assessment_id" text,
  "actor" text,
  "detail" jsonb
);

CREATE INDEX IF NOT EXISTS "evidence_at_idx" ON "evidence" ("at");
CREATE INDEX IF NOT EXISTS "evidence_project_at_idx" ON "evidence" ("project_id", "at");
CREATE INDEX IF NOT EXISTS "evidence_finding_at_idx" ON "evidence" ("finding_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "evidence_project_kind_at_idx"
  ON "evidence" ("project_id", "kind", "at");

CREATE OR REPLACE FUNCTION complyloop_reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'evidence is append-only: % not allowed', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER evidence_no_update
  BEFORE UPDATE ON evidence
  FOR EACH ROW
  EXECUTE PROCEDURE complyloop_reject_evidence_mutation();

CREATE TRIGGER evidence_no_delete
  BEFORE DELETE ON evidence
  FOR EACH ROW
  EXECUTE PROCEDURE complyloop_reject_evidence_mutation();

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "github_tokens" (
  "user_id" text PRIMARY KEY NOT NULL,
  "v" integer NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "ciphertext" text NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "refresh_token" text,
  "refresh_iv" text,
  "refresh_tag" text,
  "expires_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "delivery_id" text PRIMARY KEY NOT NULL,
  "processed_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_processed_at_idx"
  ON "webhook_deliveries" ("processed_at");

-- ---------------------------------------------------------------------------
-- Jobs + rate limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "assessment_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
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

-- recoverExpiredLeases scans running jobs by lease expiry on every claim tick.
CREATE INDEX IF NOT EXISTS "assessment_jobs_running_lease_idx"
  ON "assessment_jobs" ("lease_expires_at") WHERE "status" = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_jobs_idempotency_uidx"
  ON "assessment_jobs" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Serial-per-project backstop: the claim-time NOT EXISTS guard cannot see a
-- concurrent uncommitted `running` row under READ COMMITTED, so the database
-- rejects a second concurrent claim for the same project (23505 → null).
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_jobs_running_project_uidx"
  ON "assessment_jobs" ("project_id") WHERE "status" = 'running';

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "count" integer NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0)
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_updated_at_idx"
  ON "rate_limit_buckets" ("updated_at");
