-- Findings portfolio: denormalized `kind` for the org-level "open violations"
-- count.
--
-- `kind` is the contract's hard-fail vs review-signal split
-- (`violation` blocks a requirement, `warning` only asks for review), and the
-- cross-project overview groups by it to answer "which clients are failing".
-- Comparing `payload->>'kind'` would put a JSON path in a grouped query on
-- every project in the org; a column keeps it a plain index-backed aggregate
-- (same rule as `severity_rank` / `engine`).
--
-- Backfilled from the payload; the mapper is the only writer and always
-- supplies it, so the default is dropped again after the backfill.
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'violation';

UPDATE "findings"
SET "kind" = 'warning'
WHERE "payload" ->> 'kind' = 'warning';

ALTER TABLE "findings" ALTER COLUMN "kind" DROP DEFAULT;

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_kind_check";
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_kind_check" CHECK ("kind" IN ('violation', 'warning'));

-- Open-violation counts per project (portfolio table).
CREATE INDEX IF NOT EXISTS "findings_project_status_kind_idx"
  ON "findings" ("project_id", "status", "kind");
