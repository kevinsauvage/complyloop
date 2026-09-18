-- Evidence retention: snapshot dedup marker + tenant-erasure escape hatch.
--
-- 1. `assessment_snapshots.hashes_unchanged`: consecutive runs over an
--    unchanged tree store run metadata with an empty file-hash map instead of
--    re-storing megabytes of identical hashes (see insertAssessment; readers
--    fall back via getLatestAssessmentSnapshot).
-- 2. `complyloop_reject_evidence_mutation` gains a transaction-scoped escape
--    hatch (`complyloop.allow_evidence_erase`, SET LOCAL only): org deletion
--    erases tenant evidence (deleteEvidenceForOrg); every other path keeps
--    append-only retention. UPDATE stays unconditionally forbidden.
ALTER TABLE "assessment_snapshots"
  ADD COLUMN IF NOT EXISTS "hashes_unchanged" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION complyloop_reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('complyloop.allow_evidence_erase', true) = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'evidence is append-only: % not allowed', TG_OP
    USING ERRCODE = '42501';
END;
$$;
