CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_uidx" ON "organizations" ("slug");

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text,
  "github_login" text NOT NULL,
  "role" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "memberships_org_id_idx" ON "memberships" ("org_id");
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_github_login_idx" ON "memberships" ("github_login");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "org_id" text;
CREATE INDEX IF NOT EXISTS "projects_org_id_idx" ON "projects" ("org_id");
