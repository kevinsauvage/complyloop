import { AssessedRequirementList } from "@/components/requirements/assessed-requirement-list";
import { RequirementsIntakePanel } from "@/components/requirements/requirements-intake-panel";
import { RequirementsStatusChips } from "@/components/requirements/requirements-status-chips";
import { EmptyState, PageActionLink, PageHeader } from "@/components/page-primitives";
import { presetById } from "@/adapters/registry";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import {
  parseRequirementStatusParam,
  requirementsStatusHref,
} from "@/core/requirement-status-filter";
import type { RequirementStatus } from "@/core/statuses";
import { controlsInScope } from "@/server/assessment-status";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status: statusRaw } = await searchParams;
  const statusFilter = parseRequirementStatusParam(statusRaw);
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

  const filtered = statusFilter
    ? assessed.filter((requirement) => requirement.status === statusFilter)
    : assessed;
  const filteredControlIds = new Set(
    filtered.map((requirement) => requirement.controlId),
  );
  const filteredControls = inScopeControls.filter((control) =>
    filteredControlIds.has(control.id),
  );

  const targetLabel = target?.name ?? "all catalog controls";

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`Assessment target for "${project.name}": ${targetLabel}`}
      />

      {assessed.length > 0 ? (
        <RequirementsStatusChips
          counts={statusCounts}
          selected={statusFilter}
        />
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
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No requirements match this status"
              action={
                <PageActionLink href={requirementsStatusHref()}>
                  Clear filter
                </PageActionLink>
              }
            >
              <p>
                Try another status chip, or clear the filter to see the full
                assessed list.
              </p>
            </EmptyState>
          ) : (
            <AssessedRequirementList
              controls={filteredControls}
              requirements={filtered}
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
