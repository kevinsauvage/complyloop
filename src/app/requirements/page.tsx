import { RequirementCard } from "@/components/requirements/requirement-card";
import { RequirementsIntakePanel } from "@/components/requirements/requirements-intake-panel";
import { EmptyState, PageHeader } from "@/components/page-primitives";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const { db, project, access, activeOrgId } = await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  if (!project) {
    return (
      <>
        <PageHeader
          title="Requirements"
          description="Connect a repository to bring in and scope controls."
        />
        <EmptyState title="No project connected">
          <p>Connect a repository from the dashboard to manage requirements.</p>
        </EmptyState>
      </>
    );
  }
  const frameworks = db.frameworks;
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const inScope = new Set(
    project.inScopeControlIds ?? db.controls.map((control) => control.id),
  );
  const inScopeControls = db.controls.filter((control) =>
    inScope.has(control.id),
  );

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Bring in and scope controls for "${project.name}" — frameworks: ${frameworks.map((framework) => framework.name).join(", ")}`}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section
          aria-label="Assessed requirements"
          className="flex flex-col gap-4 lg:col-span-2"
        >
          {requirements.length === 0 ? (
            <EmptyState title="No requirements assessed yet">
              <p>
                Run an assessment from the dashboard to evaluate each in-scope
                requirement.
              </p>
            </EmptyState>
          ) : (
            inScopeControls.map((control) => {
              const requirement = requirements.find(
                (candidate) => candidate.controlId === control.id,
              );
              if (!requirement) return null;
              const openCount = db.findings.filter(
                (finding) =>
                  finding.projectId === project.id &&
                  finding.controlId === control.id &&
                  finding.status === "open",
              ).length;
              return (
                <RequirementCard
                  key={control.id}
                  control={control}
                  requirement={requirement}
                  openCount={openCount}
                  canRemediate={caps.canRemediate}
                />
              );
            })
          )}
        </section>

        <aside aria-label="Intake" className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <RequirementsIntakePanel
              canAssess={caps.canAssess}
              controls={db.controls}
              frameworks={frameworks}
              inScope={inScope}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
