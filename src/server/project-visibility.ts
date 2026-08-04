import type { Project } from "@/core/types";

/**
 * Sample and unowned (local/demo) projects are always visible. GitHub-connected
 * projects are visible only to the owning signed-in user.
 */
export function isProjectVisible(
  project: Project,
  userId: string | null | undefined,
): boolean {
  if (!project.ownerUserId) return true;
  return Boolean(userId && project.ownerUserId === userId);
}

export function visibleProjects(
  projects: ReadonlyArray<Project>,
  userId: string | null | undefined,
): Project[] {
  return projects.filter((project) => isProjectVisible(project, userId));
}

/**
 * Picks the active project among visible ones, preferring the current id when
 * still allowed, otherwise sample, otherwise the first visible project.
 */
export function resolveActiveProject(
  projects: ReadonlyArray<Project>,
  activeProjectId: string | null | undefined,
  userId: string | null | undefined,
): Project | undefined {
  const visible = visibleProjects(projects, userId);
  if (visible.length === 0) return undefined;

  const preferred = visible.find((project) => project.id === activeProjectId);
  if (preferred) return preferred;

  const sample = visible.find((project) => project.source === "sample");
  return sample ?? visible[0];
}
