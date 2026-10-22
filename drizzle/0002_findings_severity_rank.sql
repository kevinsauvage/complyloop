-- Findings list loads: denormalized severity rank for SQL ordering + caps.
--
-- `findings.severity_rank` mirrors `SEVERITY_RANK`
-- (`packages/analysis-core/src/contract/statuses.ts`, lower sorts first) so
-- list loads can `ORDER BY severity_rank, id` with the same order as the JS
-- fallback sort (`compareFindingsBySeverity`), and cap the load in SQL.
-- Backfilled from the payload; unknown legacy severities sort last (rank 3,
-- same as `minor`).
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "severity_rank" integer NOT NULL DEFAULT 3;

UPDATE "findings"
SET "severity_rank" = CASE "payload"->>'severity'
  WHEN 'critical' THEN 0
  WHEN 'serious' THEN 1
  WHEN 'moderate' THEN 2
  ELSE 3
END
WHERE "severity_rank" = 3;

ALTER TABLE "findings" ALTER COLUMN "severity_rank" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "findings_project_status_severity_idx"
  ON "findings" ("project_id", "status", "severity_rank", "id");
