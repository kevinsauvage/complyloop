CREATE TABLE IF NOT EXISTS "github_tokens" (
  "user_id" text PRIMARY KEY NOT NULL,
  "v" integer NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "ciphertext" text NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "delivery_id" text PRIMARY KEY NOT NULL,
  "processed_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_processed_at_idx"
  ON "webhook_deliveries" ("processed_at");
