import { RequirementCard } from "@/components/requirements/requirement-card";
import { RequirementsIntakePanel } from "@/components/requirements/requirements-intake-panel";
import { RequirementStatusBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-primitives";
import type { RequirementStatus } from "@/core/statuses";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

const STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

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

  const statusCounts = new Map<RequirementStatus, number>();
  for (const requirement of requirements) {
    statusCounts.set(
      requirement.status,
      (statusCounts.get(requirement.status) ?? 0) + 1,
    );
  }

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Bring in and scope controls for "${project.name}" — frameworks: ${frameworks.map((framework) => framework.name).join(", ")}`}
      />

      {requirements.length > 0 ? (
        <ul
          className="mb-6 flex flex-wrap gap-2"
          aria-label="Requirement status summary"
        >
          {STATUS_ORDER.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            if (count === 0) return null;
            return (
              <li
                key={status}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5"
              >
                <RequirementStatusBadge status={status} />
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section
          aria-label="Assessed requirements"
          className="flex flex-col gap-3 lg:col-span-2"
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
