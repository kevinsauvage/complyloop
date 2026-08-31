import { mergeAdapterControls } from "@/adapters/registry";
import type { Project } from "@/core/project-types";
import type { Db } from "./db";
import { removeProjectScopedRecords } from "./project-cascade";

type LegacyProjectSource = Project["source"] | "sample" | "local" | "git";

function isRetiredNonGitHubProject(project: Project): boolean {
  const source = project.source as LegacyProjectSource;
  return source !== "github";
}

/**
 * Drops retired sample/local/git projects and their scoped records from older
 * stores. Evidence rows are left for audit history.
 */
function purgeNonGitHubProjects(db: Db): boolean {
  const retiredIds = [
    ...db.projects
      .filter((project) => isRetiredNonGitHubProject(project))
      .map((project) => project.id),
  ];
  if (retiredIds.length === 0) return false;

  for (const projectId of retiredIds) {
    removeProjectScopedRecords(db, projectId);
  }
  const retired = new Set(retiredIds);
  db.projects = db.projects.filter((project) => !retired.has(project.id));
  return true;
}

/** Seeds registered framework adapters on first use and merges new controls. */
export function ensureSeeded(db: Db): boolean {
  let changed = purgeNonGitHubProjects(db);

  if (db.frameworks.length === 0) {
    const merged = mergeAdapterControls([], []);
    db.frameworks.push(...merged.frameworks);
    db.controls.push(...merged.controls);
    return true;
  }

  const merged = mergeAdapterControls(db.frameworks, db.controls);
  if (merged.changed) {
    db.frameworks = merged.frameworks;
    db.controls = merged.controls;
    changed = true;
  }

  return changed;
}
