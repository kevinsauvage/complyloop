import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
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
export function purgeNonGitHubProjects(db: Db): boolean {
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

/** Seeds the RGAA framework and controls on first use. */
export function ensureSeeded(db: Db): boolean {
  let changed = purgeNonGitHubProjects(db);

  if (db.frameworks.length === 0) {
    db.frameworks.push(rgaaFramework);
    db.controls.push(...rgaaControls);
    changed = true;
  } else {
    // Pick up newly shipped RGAA controls without wiping custom ones.
    const existingIds = new Set(db.controls.map((control) => control.id));
    for (const control of rgaaControls) {
      if (!existingIds.has(control.id)) {
        db.controls.push(control);
        changed = true;
      } else {
        const existing = db.controls.find(
          (candidate) => candidate.id === control.id,
        );
        if (
          existing &&
          control.complianceWeight !== undefined &&
          existing.complianceWeight !== control.complianceWeight
        ) {
          existing.complianceWeight = control.complianceWeight;
          changed = true;
        }
      }
    }
    if (!db.frameworks.some((framework) => framework.id === rgaaFramework.id)) {
      db.frameworks.push(rgaaFramework);
      changed = true;
    }
  }

  return changed;
}
