import type { ReactNode } from "react";
import { Suspense } from "react";

import { ProjectNavSkeleton } from "@/components/shell/project-nav";
import { ProjectNavBadges } from "@/components/shell/project-nav-badges";
import { loadProjectPage } from "@/server/workspace/project-page";

/**
 * Project chrome for every `/projects/[projectId]/…` page. Validating here means
 * an unknown or invisible project id 404s the whole segment, so no child page
 * can render another tenant's data.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await loadProjectPage(projectId);

  return (
    <>
      <Suspense fallback={<ProjectNavSkeleton />}>
        <ProjectNavBadges projectId={projectId} />
      </Suspense>
      {children}
    </>
  );
}
