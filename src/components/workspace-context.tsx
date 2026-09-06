import type { ReactNode } from "react";
import { FolderGit2, Layers } from "lucide-react";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspaceContext } from "@/server/workspace";
import { getDrizzle } from "@complyloop/db/client";
import { listLatestAssessmentForProject } from "@complyloop/db/repo/assessments";
import { cn } from "@/lib/utils";

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
        "mb-6 flex flex-wrap items-center gap-2 surface-panel px-3 py-2.5 text-sm text-muted-foreground backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Active org/project context + switchers for every workflow page. */
export async function WorkspaceContext() {
  const { db, project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspaceContext();
  const caps = projectCapabilities(project, access, activeOrgId);
  const latestAssessment = project
    ? (await listLatestAssessmentForProject(await getDrizzle(), project.id))[0]
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
      <ContextStrip>
        <Layers className="size-4 text-signal" aria-hidden />
        <span className="font-medium text-foreground">No project connected</span>
        {orgName ? (
          <>
            <span aria-hidden className="text-border">
              /
            </span>
            <span>{orgName}</span>
          </>
        ) : null}
        {connectProject ? <div className="ml-auto">{connectProject}</div> : null}
      </ContextStrip>
    );
  }

  if (!showOrgSwitcher && !showProjectSwitcher) {
    return (
      <ContextStrip>
        <FolderGit2 className="size-4 shrink-0 text-signal" aria-hidden />
        <span className="font-medium text-foreground">{project.name}</span>
        {orgName ? (
          <>
            <span aria-hidden className="text-border">
              /
            </span>
            <span>{orgName}</span>
          </>
        ) : null}
        {coverageStrip}
        {addProject ? (
          <div className={coverageStrip ? "" : "ml-auto"}>{addProject}</div>
        ) : null}
      </ContextStrip>
    );
  }

  return (
    <ContextStrip className="gap-3">
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
    </ContextStrip>
  );
}
