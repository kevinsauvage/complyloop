import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import type { Organization, Project } from "@complyloop/analysis-core/contract/project-types";

/** Org/project switchers embedded in the dashboard hero (replaces the global context strip). */
export function DashboardWorkspaceToolbar({
  project,
  visibleProjects,
  organizations,
  activeOrgId,
  canConnect,
}: {
  project: Project | null;
  visibleProjects: Project[];
  organizations: Organization[];
  activeOrgId: string | null;
  canConnect: boolean;
}) {
  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject = canConnect && visibleProjects.length > 0;
  const showConnect = canConnect && visibleProjects.length === 0;

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