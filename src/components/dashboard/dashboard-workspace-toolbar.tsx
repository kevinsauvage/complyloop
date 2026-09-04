import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

/** Org/project switchers embedded in the dashboard hero (replaces the global context strip). */
export async function DashboardWorkspaceToolbar() {
  const { project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);

  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject = caps.canConnect && visibleProjects.length > 0;
  const showConnect = caps.canConnect && visibleProjects.length === 0;

  if (!project && !showConnect) return null;

  const hasContent =
    showOrgSwitcher ||
    (project != null && showProjectSwitcher) ||
    showAddProject ||
    showConnect;

  if (!hasContent) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-4">
      {showOrgSwitcher && activeOrgId ? (
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
      ) : null}
      {project && showProjectSwitcher ? (
        <ProjectSwitcher
          projects={visibleProjects}
          activeProjectId={project.id}
        />
      ) : null}
      {showAddProject ? <ConnectProjectPanel defaultOpen={false} /> : null}
      {showConnect ? (
        <ConnectProjectPanel defaultOpen={false} triggerLabel="Connect project" />
      ) : null}
    </div>
  );
}
