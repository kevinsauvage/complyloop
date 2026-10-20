-- Typed columns for the JSONB fields SQL actually filters and orders on.
--
-- 1. `findings.detected_at`: `countsOfOpenFindingsDetectedAfterForControls`
--    compared `payload->>'detectedAt'` as text, which happens to sort because
--    the app writes UTC ISO strings — but a single offset or a missing value
--    silently drops the row. Now a real timestamptz, indexed for the
--    sticky-decision re-arm read.
-- 2. `assessments.started_at` / `completed_at`: every assessment read ordered
--    on `payload->>'completedAt'`. Same text-sort accident; now typed, and the
--    payload-expression index becomes a real column index.
-- 3. `evidence.summary` trigram index: the evidence page's free-text filter is
--    an unindexed `ilike '%q%'` over an append-only table that grows forever.
--
-- Payload stays the source of truth for the entity; these are projections
-- written by `packages/db/src/repo/mappers.ts` (same rule as
-- `findings.severity_rank` / `findings.engine`).
--
-- Columns stay NULLABLE on purpose: a legacy row with an unparseable payload
-- value must not abort a production migration. Readers filter with
-- `IS NOT NULL` (a missing timestamp is "unknown", never "long ago").
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "detected_at" timestamptz;

UPDATE "findings"
SET "detected_at" = ("payload" ->> 'detectedAt')::timestamptz
WHERE "detected_at" IS NULL
  AND "payload" ->> 'detectedAt' ~ '^\d{4}-\d{2}-\d{2}';

-- Re-arm read: open findings for a set of controls detected after a human
-- decision. Partial index keeps it proportional to the open set.
CREATE INDEX IF NOT EXISTS "findings_open_detected_idx"
  ON "findings" ("project_id", "control_id", "detected_at")
  WHERE "status" = 'open';

ALTER TABLE "assessments"
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

UPDATE "assessments"
SET "started_at" = ("payload" ->> 'startedAt')::timestamptz
WHERE "started_at" IS NULL
  AND "payload" ->> 'startedAt' ~ '^\d{4}-\d{2}-\d{2}';

UPDATE "assessments"
SET "completed_at" = ("payload" ->> 'completedAt')::timestamptz
WHERE "completed_at" IS NULL
  AND "payload" ->> 'completedAt' ~ '^\d{4}-\d{2}-\d{2}';

-- Latest-per-project ordering on real columns; supersedes the payload
-- expression index of the same shape.
CREATE INDEX IF NOT EXISTS "assessments_project_completed_at_idx"
  ON "assessments" ("project_id", "completed_at" DESC, "started_at" DESC);

DROP INDEX IF EXISTS "assessments_project_completed_idx";

-- Free-text evidence search. trigram GIN supports the `%q%` substring filter
-- that a btree cannot.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "evidence_summary_trgm_idx"
  ON "evidence" USING gin ("summary" gin_trgm_ops);
