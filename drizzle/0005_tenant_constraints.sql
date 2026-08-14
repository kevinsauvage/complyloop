-- Tenant integrity: FKs on mutable tables, status/role checks, GitHub identity
-- uniqueness, and project-scoped indexes for dashboard/findings/evidence.
-- Evidence has no FKs so append-only rows survive project disconnect / org delete.
-- Mutable FKs use ON DELETE CASCADE so persist can prune parents before children.

-- ---------------------------------------------------------------------------
-- Orphan cleanup (mutable tables only)
-- ---------------------------------------------------------------------------
DELETE FROM remediations r
  WHERE NOT EXISTS (SELECT 1 FROM findings f WHERE f.id = r.finding_id);

DELETE FROM findings f
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = f.project_id)
     OR NOT EXISTS (SELECT 1 FROM controls c WHERE c.id = f.control_id)
     OR NOT EXISTS (SELECT 1 FROM assessments a WHERE a.id = f.assessment_id);

DELETE FROM alerts a
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a.project_id);

DELETE FROM requirements r
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id)
     OR NOT EXISTS (SELECT 1 FROM controls c WHERE c.id = r.control_id);

DELETE FROM assessments a
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a.project_id);

DELETE FROM memberships m
  WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = m.org_id);

UPDATE projects
  SET org_id = NULL
  WHERE org_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = projects.org_id);

DELETE FROM controls c
  WHERE NOT EXISTS (SELECT 1 FROM frameworks f WHERE f.id = c.framework_id);

-- ---------------------------------------------------------------------------
-- Requirement status column (indexed + checked; payload remains canonical)
-- ---------------------------------------------------------------------------
ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "status" text;

UPDATE "requirements"
  SET "status" = COALESCE("payload"->>'status', 'unable_to_verify')
  WHERE "status" IS NULL;

ALTER TABLE "requirements" ALTER COLUMN "status" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_role_check";
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_role_check"
  CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'));

ALTER TABLE "requirements" DROP CONSTRAINT IF EXISTS "requirements_status_check";
ALTER TABLE "requirements"
  ADD CONSTRAINT "requirements_status_check"
  CHECK ("status" IN ('passed', 'failed', 'needs_review', 'not_applicable', 'unable_to_verify'));

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_status_check";
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_status_check"
  CHECK ("status" IN ('open', 'resolved', 'dismissed'));

ALTER TABLE "remediations" DROP CONSTRAINT IF EXISTS "remediations_status_check";
ALTER TABLE "remediations"
  ADD CONSTRAINT "remediations_status_check"
  CHECK ("status" IN ('detected', 'investigating', 'suggested', 'approved', 'implemented', 'verified'));

-- ---------------------------------------------------------------------------
-- Unique project identity (GitHub fullName is case-insensitive)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_github_uidx"
  ON "projects" ("org_id", lower(("payload"->'github'->>'fullName')))
  WHERE "org_id" IS NOT NULL
    AND "payload"->'github'->>'fullName' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "projects_owner_github_uidx"
  ON "projects" ("owner_user_id", lower(("payload"->'github'->>'fullName')))
  WHERE "owner_user_id" IS NOT NULL
    AND "payload"->'github'->>'fullName' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Foreign keys (mutable tables only)
-- ---------------------------------------------------------------------------
ALTER TABLE "controls" DROP CONSTRAINT IF EXISTS "controls_framework_id_fk";
ALTER TABLE "controls"
  ADD CONSTRAINT "controls_framework_id_fk"
  FOREIGN KEY ("framework_id") REFERENCES "frameworks" ("id") ON DELETE CASCADE;

ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_org_id_fk";
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_org_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_org_id_fk";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_org_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE;

ALTER TABLE "requirements" DROP CONSTRAINT IF EXISTS "requirements_project_id_fk";
ALTER TABLE "requirements"
  ADD CONSTRAINT "requirements_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE;

ALTER TABLE "requirements" DROP CONSTRAINT IF EXISTS "requirements_control_id_fk";
ALTER TABLE "requirements"
  ADD CONSTRAINT "requirements_control_id_fk"
  FOREIGN KEY ("control_id") REFERENCES "controls" ("id") ON DELETE CASCADE;

ALTER TABLE "assessments" DROP CONSTRAINT IF EXISTS "assessments_project_id_fk";
ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE;

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_project_id_fk";
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE;

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_control_id_fk";
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_control_id_fk"
  FOREIGN KEY ("control_id") REFERENCES "controls" ("id") ON DELETE CASCADE;

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_assessment_id_fk";
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_assessment_id_fk"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments" ("id") ON DELETE CASCADE;

ALTER TABLE "remediations" DROP CONSTRAINT IF EXISTS "remediations_finding_id_fk";
ALTER TABLE "remediations"
  ADD CONSTRAINT "remediations_finding_id_fk"
  FOREIGN KEY ("finding_id") REFERENCES "findings" ("id") ON DELETE CASCADE;

ALTER TABLE "alerts" DROP CONSTRAINT IF EXISTS "alerts_project_id_fk";
ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Project-scoped indexes (replace unscoped / redundant single-column indexes)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "requirements_project_status_idx"
  ON "requirements" ("project_id", "status");

CREATE INDEX IF NOT EXISTS "findings_project_status_idx"
  ON "findings" ("project_id", "status");

CREATE INDEX IF NOT EXISTS "findings_project_assessment_idx"
  ON "findings" ("project_id", "assessment_id");

CREATE INDEX IF NOT EXISTS "evidence_project_at_idx"
  ON "evidence" ("project_id", "at");

DROP INDEX IF EXISTS "requirements_project_id_idx";
DROP INDEX IF EXISTS "findings_project_id_idx";
DROP INDEX IF EXISTS "findings_status_idx";
DROP INDEX IF EXISTS "evidence_project_id_idx";
