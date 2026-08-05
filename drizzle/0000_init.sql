CREATE TABLE IF NOT EXISTS "frameworks" (
  "id" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "controls" (
  "id" text PRIMARY KEY NOT NULL,
  "framework_id" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "owner_user_id" text,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "requirements" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "control_id" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "assessments" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "findings" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "control_id" text NOT NULL,
  "assessment_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "remediations" (
  "id" text PRIMARY KEY NOT NULL,
  "finding_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "read" boolean DEFAULT false NOT NULL,
  "payload" jsonb NOT NULL
);

-- Append-only: application must never UPDATE or DELETE rows in this table.
CREATE TABLE IF NOT EXISTS "evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "kind" text NOT NULL,
  "summary" text NOT NULL,
  "project_id" text,
  "control_id" text,
  "finding_id" text,
  "assessment_id" text,
  "detail" jsonb
);

CREATE TABLE IF NOT EXISTS "app_meta" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "controls_framework_id_idx" ON "controls" ("framework_id");
CREATE INDEX IF NOT EXISTS "requirements_project_id_idx" ON "requirements" ("project_id");
CREATE INDEX IF NOT EXISTS "assessments_project_id_idx" ON "assessments" ("project_id");
CREATE INDEX IF NOT EXISTS "findings_project_id_idx" ON "findings" ("project_id");
CREATE INDEX IF NOT EXISTS "evidence_project_id_idx" ON "evidence" ("project_id");
CREATE INDEX IF NOT EXISTS "evidence_at_idx" ON "evidence" ("at");
