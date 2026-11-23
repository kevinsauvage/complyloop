-- Organization-level AI Gateway key (BYOK) and its configuration audit trail.
--
-- The key is AES-256-GCM encrypted with AI_KEYS_ENCRYPTION_KEY and the org id
-- as additional authenticated data, so a ciphertext copied to another org row
-- fails authentication. Plaintext never reaches this table.
--
-- Cascades cover org deletion; there is no separate delete path.

CREATE TABLE IF NOT EXISTS "org_ai_settings" (
  "org_id" text PRIMARY KEY REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "model" text NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "ciphertext" text NOT NULL,
  "key_last4" text NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "org_ai_settings_events" (
  "id" text PRIMARY KEY,
  "org_id" text NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "at" timestamptz NOT NULL,
  "actor" text NOT NULL,
  "action" text NOT NULL CHECK ("action" IN ('configured', 'removed')),
  "model" text
);

CREATE INDEX IF NOT EXISTS "org_ai_settings_events_org_at_idx"
  ON "org_ai_settings_events" ("org_id", "at" DESC);
