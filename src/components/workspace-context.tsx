import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

function hasNonSampleProject(
  projects: ReadonlyArray<{ source: string }>,
): boolean {
  return projects.some((project) => project.source !== "sample");
}

/** Active org/project context + switchers for every workflow page. */
export async function WorkspaceContext() {
  const { db, project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspace();
  const caps = projectCapabilities(project, access);
  const orgName = project.orgId
    ? db.organizations.find((org) => org.id === project.orgId)?.name
    : activeOrgId
      ? organizations.find((org) => org.id === activeOrgId)?.name
      : undefined;

  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject =
    caps.canConnect && hasNonSampleProject(visibleProjects);

  const addProject =
    showAddProject ? <ConnectProjectPanel defaultOpen={false} /> : null;

  // Nothing to switch — quiet identity strip (+ optional add project).
  if (!showOrgSwitcher && !showProjectSwitcher) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{project.name}</span>
        {orgName ? (
          <>
            <span aria-hidden>·</span>
            <span>{orgName}</span>
          </>
        ) : null}
        {addProject ? <div className="ml-auto">{addProject}</div> : null}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-4">
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
      {addProject ? <div className="ml-auto">{addProject}</div> : null}
    </div>
  );
}
