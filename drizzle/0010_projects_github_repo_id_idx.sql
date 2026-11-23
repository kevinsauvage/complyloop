-- Webhook deliveries resolve the project by the stable GitHub repository id
-- (`findProjectsByGithubRepoId`) before falling back to the name, with no
-- org_id. Without this index every delivery scanned the projects table.
-- Partial: rows connected before the id was stored hold no `repoId`.
CREATE INDEX IF NOT EXISTS "projects_github_repo_id_idx"
  ON "projects" (("payload"->'github'->>'repoId'))
  WHERE "payload"->'github'->>'repoId' IS NOT NULL;
