import { navAttentionForProject } from "@/server/reporting/nav-attention";
import { getWorkspace } from "@/server/workspace/workspace";

import { ProjectNav } from "./project-nav";

/**
 * Active project header + tabs with live badge counts. Render inside
 * `<Suspense fallback={<ProjectNavSkeleton />}>` so the shell and route
 * content stream first instead of waiting on the counts query.
 */
export async function NavAttentionBadges() {
  const { project } = await getWorkspace();
  if (!project) return <ProjectNav project={null} />;
  const counts = await navAttentionForProject(project);
  return (
    <ProjectNav
      project={{ name: project.name, repo: project.github?.fullName ?? null }}
      navAttention={counts}
    />
  );
}
