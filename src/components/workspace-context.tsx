import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { getWorkspace } from "@/server/workspace";

/** Active org/project context + switchers for every workflow page. */
export async function WorkspaceContext() {
  const { db, project, visibleProjects, organizations, activeOrgId } =
    await getWorkspace();
  const orgName = project.orgId
    ? db.organizations.find((org) => org.id === project.orgId)?.name
    : activeOrgId
      ? organizations.find((org) => org.id === activeOrgId)?.name
      : undefined;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-zinc-100 pb-4">
      <p className="text-sm text-zinc-600">
        Active project{" "}
        <span className="font-medium text-zinc-900">{project.name}</span>
        {orgName ? (
          <>
            {" "}
            · org <span className="font-medium text-zinc-900">{orgName}</span>
          </>
        ) : null}
      </p>
      {activeOrgId ? (
        <OrgSwitcher
          organizations={organizations}
          activeOrgId={activeOrgId}
        />
      ) : null}
      <ProjectSwitcher
        projects={visibleProjects}
        activeProjectId={project.id}
      />
    </div>
  );
}
