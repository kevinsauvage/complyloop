ALTER TABLE "github_tokens"
  ADD COLUMN IF NOT EXISTS "refresh_token" text,
  ADD COLUMN IF NOT EXISTS "refresh_iv" text,
  ADD COLUMN IF NOT EXISTS "refresh_tag" text,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
