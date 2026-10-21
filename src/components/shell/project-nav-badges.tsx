import { navAttentionForProject } from "@/server/reporting/nav-attention";
import { loadProjectPage } from "@/server/workspace/project-page";

import { ProjectNav } from "./project-nav";

/**
 * Project header + tabs with live badge counts, rendered by the project layout.
 * Render inside `<Suspense fallback={<ProjectNavSkeleton />}>` so the shell and
 * route content stream first instead of waiting on the counts query.
 */
export async function ProjectNavBadges({ projectId }: { projectId: string }) {
  const { project } = await loadProjectPage(projectId);
  const counts = await navAttentionForProject(project);
  return (
    <ProjectNav
      projectId={project.id}
      project={{ name: project.name, repo: project.github?.fullName ?? null }}
      navAttention={counts}
    />
  );
}
