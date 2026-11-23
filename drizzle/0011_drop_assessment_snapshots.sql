-- Change detection asks the GitHub compare API instead of diffing a per-run
-- file-hash map, so the snapshot table has no reader or writer left: the
-- commit (`sources.gitHead`) and the control-scope fingerprint ride in the
-- assessment payload.
--
-- Expand/contract: `0011`'s code release must be live before this runs, or a
-- rollback to a release that still writes snapshots would fail every
-- assessment on this table's absence.

DROP TABLE IF EXISTS "assessment_snapshots";
