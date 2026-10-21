-- Invites bind to the GitHub numeric account id instead of the login, which
-- GitHub recycles: the sign-in claim and the pre-claim org listing match
-- this column (the Auth.js user id is the same GitHub id).
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "github_user_id" text;

-- Pending invites only: claimed rows are found by "user_id".
CREATE INDEX IF NOT EXISTS "memberships_github_user_id_unclaimed_idx"
  ON "memberships" ("github_user_id")
  WHERE "user_id" IS NULL;

-- Login-only invites can no longer be claimed. Pre-launch: drop them rather
-- than keep rows nobody can ever accept.
DELETE FROM "memberships"
WHERE "user_id" IS NULL AND "github_user_id" IS NULL;
