-- Remediation verify moved off the finding-page server action (which traced
-- playwright-core + @sparticuz/chromium into every Vercel function) onto the
-- GitHub Actions worker. The queue needs a third trigger kind to tell the
-- worker "re-audit this finding's implemented remediation" apart from a full
-- project assessment.
ALTER TABLE "assessment_jobs"
  DROP CONSTRAINT "assessment_jobs_trigger_check";

ALTER TABLE "assessment_jobs"
  ADD CONSTRAINT "assessment_jobs_trigger_check"
  CHECK ("trigger" IN ('manual', 'webhook', 'verify_remediation'));
