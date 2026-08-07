import { RequirementCard } from "@/components/requirements/requirement-card";
import { RequirementsIntakePanel } from "@/components/requirements/requirements-intake-panel";
import { EmptyState, PageHeader } from "@/components/ui";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const { db, project, access } = await getWorkspace();
  const caps = projectCapabilities(project, access);
  const frameworks = db.frameworks;
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const inScope = new Set(
    project.inScopeControlIds ?? db.controls.map((control) => control.id),
  );

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Bring in and scope controls for "${project.name}" — frameworks: ${frameworks.map((framework) => framework.name).join(", ")}`}
      />

      <RequirementsIntakePanel
        canAssess={caps.canAssess}
        controls={db.controls}
        frameworks={frameworks}
        inScope={inScope}
      />

      {requirements.length === 0 ? (
        <EmptyState title="No requirements assessed yet">
          <p>Run an assessment from the dashboard to evaluate each in-scope requirement.</p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {db.controls
            .filter((control) => inScope.has(control.id))
            .map((control) => {
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
            })}
        </div>
      )}
    </>
  );
}
