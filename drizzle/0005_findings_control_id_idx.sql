-- Findings list filters by `control_id` (`listFindingsPageForProject`) and
-- groups by it (`countOpenFindingsByControlForProject`); neither was covered
-- by an index, so both degraded to scans as finding history grew.
CREATE INDEX IF NOT EXISTS "findings_project_control_idx"
  ON "findings" ("project_id", "control_id");
