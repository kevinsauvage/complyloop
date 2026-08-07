-- Enforce append-only evidence at the database layer (app role cannot mutate).
CREATE OR REPLACE FUNCTION complyloop_reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'evidence is append-only: % not allowed', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS evidence_no_update ON evidence;
CREATE TRIGGER evidence_no_update
  BEFORE UPDATE ON evidence
  FOR EACH ROW
  EXECUTE PROCEDURE complyloop_reject_evidence_mutation();

DROP TRIGGER IF EXISTS evidence_no_delete ON evidence;
CREATE TRIGGER evidence_no_delete
  BEFORE DELETE ON evidence
  FOR EACH ROW
  EXECUTE PROCEDURE complyloop_reject_evidence_mutation();
