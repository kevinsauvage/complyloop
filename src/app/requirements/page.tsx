import { AssessedRequirementList } from "@/components/requirements/assessed-requirement-list";
import { RequirementsIntakePanel } from "@/components/requirements/requirements-intake-panel";
import { RequirementStatusBadge } from "@/components/badges";
import { EmptyState, PageActionLink, PageHeader } from "@/components/page-primitives";
import { presetById } from "@/adapters/registry";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import type { RequirementStatus } from "@/core/statuses";
import { controlsInScope } from "@/server/assessment-status";
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
          description="Connect a repository to choose an assessment target."
        />
        <EmptyState
          title="No project connected"
          action={<PageActionLink href="/">Go to dashboard</PageActionLink>}
        >
          <p>Connect a repository from the dashboard to manage requirements.</p>
        </EmptyState>
      </>
    );
  }
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const inScopeControls = controlsInScope(db, project);
  const inScopeIds = new Set(inScopeControls.map((control) => control.id));
  const assessed = requirements.filter((requirement) =>
    inScopeIds.has(requirement.controlId),
  );
  const target = project.assessmentPresetId
    ? presetById(project.assessmentPresetId)
    : undefined;
  const frameworkId = target?.frameworkId ?? rgaaFramework.id;

  const openFindingCounts = new Map<string, number>();
  for (const finding of db.findings) {
    if (finding.projectId !== project.id || finding.status !== "open") continue;
    openFindingCounts.set(
      finding.controlId,
      (openFindingCounts.get(finding.controlId) ?? 0) + 1,
    );
  }

  const statusCounts = new Map<RequirementStatus, number>();
  for (const requirement of assessed) {
    statusCounts.set(
      requirement.status,
      (statusCounts.get(requirement.status) ?? 0) + 1,
    );
  }

  const targetLabel = target?.name ?? "all catalog controls";

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Assessment target for "${project.name}": ${targetLabel}`}
      />

      {assessed.length > 0 ? (
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
          {assessed.length === 0 ? (
            <EmptyState
              title="No requirements assessed yet"
              action={<PageActionLink href="/">Go to dashboard</PageActionLink>}
            >
              <p>
                Run an assessment from the dashboard to evaluate each in-scope
                requirement.
              </p>
            </EmptyState>
          ) : (
            <AssessedRequirementList
              controls={inScopeControls}
              requirements={assessed}
              openFindingCounts={openFindingCounts}
              frameworkId={frameworkId}
              canRemediate={caps.canRemediate}
            />
          )}
        </section>

        <aside aria-label="Intake" className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <RequirementsIntakePanel
              canAssess={caps.canAssess}
              currentPresetId={project.assessmentPresetId}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
