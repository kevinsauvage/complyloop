import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

/** Active org/project context + switchers for every workflow page. */
export async function WorkspaceContext() {
  const { db, project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  const latestAssessment = project
    ? db.assessments.filter((a) => a.projectId === project.id).at(-1)
    : undefined;
  const coverageStrip = project ? (
    <RuntimeCoverageChip
      project={project}
      engines={latestAssessment?.engines}
      compact
      className="ml-auto"
    />
  ) : null;
  const orgName = project?.orgId
    ? db.organizations.find((org) => org.id === project.orgId)?.name
    : activeOrgId
      ? organizations.find((org) => org.id === activeOrgId)?.name
      : undefined;

  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject = caps.canConnect && visibleProjects.length > 0;
  const showConnect =
    caps.canConnect && visibleProjects.length === 0;

  const addProject = showAddProject ? (
    <ConnectProjectPanel defaultOpen={false} />
  ) : null;
  const connectProject = showConnect ? (
    <ConnectProjectPanel defaultOpen={false} triggerLabel="Connect project" />
  ) : null;

  if (!project) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">No project connected</span>
        {orgName ? (
          <>
            <span aria-hidden>·</span>
            <span>{orgName}</span>
          </>
        ) : null}
        {connectProject ? <div className="ml-auto">{connectProject}</div> : null}
      </div>
    );
  }

  // Nothing to switch — quiet identity strip (+ optional add project).
  if (!showOrgSwitcher && !showProjectSwitcher) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{project.name}</span>
        {orgName ? (
          <>
            <span aria-hidden>·</span>
            <span>{orgName}</span>
          </>
        ) : null}
      {coverageStrip}
      {addProject ? <div className={coverageStrip ? "" : "ml-auto"}>{addProject}</div> : null}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
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
      {coverageStrip}
      {addProject ? <div className={coverageStrip ? "" : "ml-auto"}>{addProject}</div> : null}
    </div>
  );
}
