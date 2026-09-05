-- One requirement row per (project, control). Duplicates were possible when a
-- long assessment scan (fresh in-memory id) raced a targeted human write for
-- the same control. Keep the most recently updated row, then enforce.
DELETE FROM "requirements" a
USING "requirements" b
WHERE a.project_id = b.project_id
  AND a.control_id = b.control_id
  AND a.id <> b.id
  AND (
    COALESCE(a.payload->>'updatedAt', '') < COALESCE(b.payload->>'updatedAt', '')
    OR (
      COALESCE(a.payload->>'updatedAt', '') = COALESCE(b.payload->>'updatedAt', '')
      AND a.id < b.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "requirements_project_control_uidx"
  ON "requirements" ("project_id", "control_id");
