-- Hot-path indexes + membership uniqueness (claimed users and invites).
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_user_uidx"
  ON "memberships" ("org_id", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_login_uidx"
  ON "memberships" ("org_id", lower("github_login"));

CREATE INDEX IF NOT EXISTS "findings_status_idx" ON "findings" ("status");
CREATE INDEX IF NOT EXISTS "remediations_finding_id_idx" ON "remediations" ("finding_id");
CREATE INDEX IF NOT EXISTS "alerts_project_id_idx" ON "alerts" ("project_id");
