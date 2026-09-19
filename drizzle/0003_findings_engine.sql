-- Findings list filters: denormalized engine bucket for SQL filtering.
--
-- `findings.engine` mirrors `engineFor` (`ANALYZER_META` in
-- `packages/analysis-core/src/contract/finding-types.ts`: axe, html-validate,
-- playwright-custom, site-level, and linkinator findings are `runtime`;
-- ast, jsx-a11y, and missing analyzers are `ast`) so the engine list filter
-- runs in SQL. Backfilled from the payload; unknown legacy analyzers fall
-- back to `ast` (same default the mapper uses for unrecognized values).
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "engine" text NOT NULL DEFAULT 'ast';

UPDATE "findings"
SET "engine" = CASE "payload"->>'analyzerId'
  WHEN 'axe' THEN 'runtime'
  WHEN 'html-validate' THEN 'runtime'
  WHEN 'playwright-custom' THEN 'runtime'
  WHEN 'site-level' THEN 'runtime'
  WHEN 'linkinator' THEN 'runtime'
  ELSE 'ast'
END
WHERE "engine" = 'ast';

ALTER TABLE "findings" ALTER COLUMN "engine" DROP DEFAULT;

-- No IF NOT EXISTS: Postgres does not support it for ADD CONSTRAINT. Single
-- application is guaranteed by the `_complyloop_migrations` tracking table.
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_engine_check"
  CHECK ("engine" IN ('ast', 'runtime'));
