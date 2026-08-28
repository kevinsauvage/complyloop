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

    // Initialize frameworkIds for all existing projects to undefined (all frameworks)
    for (const project of db.projects) {
      // Ensure frameworkIds exists and is undefined (meaning all frameworks)
      if (project.frameworkIds === undefined) {
        // Already undefined, which is correct for backward compatibility
        // No need to change anything
      } else if (project.frameworkIds === null) {
        // Convert null to undefined for consistency
        project.frameworkIds = undefined;
        changed = true;
      }
      // If it's already an array, leave it as is
    }

    return true;
  }

  const merged = mergeAdapterControls(db.frameworks, db.controls);
  if (merged.changed) {
    db.frameworks = merged.frameworks;
    db.controls = merged.controls;
    changed = true;

    // When new frameworks are added, ensure existing projects have frameworkIds set
    // If frameworkIds is undefined, it means all frameworks (backward compatibility)
    // If it's defined as an array, we keep it as is
    for (const project of db.projects) {
      // Ensure frameworkIds exists
      if (project.frameworkIds === undefined) {
        // If not set, default to undefined (all frameworks) for backward compatibility
        // No change needed
      } else if (project.frameworkIds === null) {
        // Convert null to undefined for consistency
        project.frameworkIds = undefined;
        changed = true;
      }
      // If it's already an array, leave it as is
    }
  }

  return changed;
}