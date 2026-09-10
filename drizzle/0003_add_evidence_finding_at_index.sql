-- Finding detail and PR prep query evidence by finding_id and sort by at.
-- Without this index the append-only evidence table is sequentially scanned
-- and sorted for a single finding's trail.
CREATE INDEX IF NOT EXISTS "evidence_finding_at_idx"
  ON "evidence" ("finding_id", "at" DESC);
