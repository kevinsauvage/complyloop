import { FolderGit2, Layers } from "lucide-react";
import type { ReactNode } from "react";

import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { cn } from "@/lib/utils";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

function ContextStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-panel mb-6 flex flex-col gap-2 px-3 py-2.5 text-sm text-muted-foreground backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Active org/project context + switchers for every workflow page.
 * Coverage status lives on the dashboard hero — the strip stays a switcher.
 */
export async function WorkspaceContext() {
  const { project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  const orgName = project?.orgId
    ? organizations.find((org) => org.id === project.orgId)?.name
    : activeOrgId
      ? organizations.find((org) => org.id === activeOrgId)?.name
      : undefined;

  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject = caps.canConnect && visibleProjects.length > 0;

  // Single Connect entry point per page: the dashboard empty card owns
  // connecting when no project exists; other pages link back to it.
  const addProject = showAddProject ? (
    <ConnectProjectPanel defaultOpen={false} />
  ) : null;

  if (!project) {
    return (
      <ContextStrip>
        <span className="flex items-center gap-2">
          <Layers className="size-4 text-signal" aria-hidden />
          <span className="font-medium text-foreground">No project connected</span>
        </span>
        {orgName ? (
          <span className="flex items-center gap-2">
            <span aria-hidden className="text-border">
              /
            </span>
            <span>{orgName}</span>
          </span>
        ) : null}
      </ContextStrip>
    );
  }

if (!showOrgSwitcher && !showProjectSwitcher) {
    return (
      <ContextStrip>
        {orgName ? (
          <span className="flex items-center gap-2">
            <span>{orgName}</span>
            <span aria-hidden className="text-border">
              /
            </span>
          </span>
        ) : null}
        <span className="flex items-center gap-2 font-medium text-foreground">
          <FolderGit2 className="size-4 shrink-0 text-signal" aria-hidden />
          {project.name}
        </span>
        {addProject ? (
          <div className="w-full sm:ml-auto sm:w-auto">{addProject}</div>
        ) : null}
      </ContextStrip>
    );
  }

  return (
    <ContextStrip>
      {showOrgSwitcher && activeOrgId ? (
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
      ) : orgName ? (
        <span className="text-sm text-muted-foreground">{orgName}</span>
      ) : null}
      {showProjectSwitcher ? (
        <ProjectSwitcher
          projects={visibleProjects}
          activeProjectId={project.id}
        />
      ) : (
        <span className="text-sm font-medium text-foreground">{project.name}</span>
      )}
      {addProject ? (
        <div className="w-full sm:ml-auto sm:w-auto">{addProject}</div>
      ) : null}
    </ContextStrip>
  );
}
