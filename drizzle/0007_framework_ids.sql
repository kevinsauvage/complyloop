-- Add frameworkIds column to projects table for framework-scoped assessments
ALTER TABLE projects
ADD COLUMN framework_ids jsonb;