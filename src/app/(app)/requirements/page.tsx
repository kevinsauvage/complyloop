import { AssessedRequirementList } from "@/components/requirements/assessed-requirement-list";
import { RequirementsPresetPanel } from "@/components/requirements/requirements-preset-panel";
import { RequirementsStatusChips } from "@/components/requirements/requirements-status-chips";
import { EmptyState, PageActionLink, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import { presetById, defaultConnectPreset, presetCatalog } from "@/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import {
  effectiveRequirementsPresetId,
  parsePresetIdParam,
  requirementsPageHref,
} from "@/core/requirements-page";
import {
  parseRequirementStatusParam,
} from "@/core/requirement-status-filter";
import type { RequirementStatus } from "@/core/statuses";
import type { Control } from "@/core/project-types";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

function controlsForPreset(
  controls: readonly Control[],
  presetId: string,
): Control[] {
  const preset = presetById(presetId);
  if (!preset) return [];
  const ids = new Set(preset.controlIds);
  return controls.filter((control) => ids.has(control.id));
}

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; presetId?: string | string[] }>;
}) {
  const params = await searchParams;
  const statusFilter = parseRequirementStatusParam(params.status);
  const urlPresetId = parsePresetIdParam(params.presetId, presetCatalog);
  const { db, project, access, activeOrgId } = await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  if (!project) {
    return (
      <>
        <PageHeader
          title="Requirements"
          description="Connect a repository to browse requirements by preset."
        />
        <EmptyState
          title="No project connected"
          action={<PageActionLink href="/dashboard">Go to dashboard</PageActionLink>}
        >
          <p>Connect a repository from the dashboard to manage requirements.</p>
        </EmptyState>
      </>
    );
  }

  const defaultPresetId = projectDefaultPresetId(project, presetCatalog);
  const selectedPresetId = effectiveRequirementsPresetId(
    project,
    urlPresetId,
    presetCatalog,
  );
  const selectedPreset = presetById(selectedPresetId);
  const frameworkId =
    selectedPreset?.frameworkId ?? defaultConnectPreset().frameworkId;

  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const presetControls = controlsForPreset(db.controls, selectedPresetId);
  const inScopeIds = new Set(presetControls.map((control) => control.id));
  const assessed = requirements.filter((requirement) =>
    inScopeIds.has(requirement.controlId),
  );

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
  const filteredControls = presetControls.filter((control) =>
    filteredControlIds.has(control.id),
  );

  const targetLabel = selectedPreset?.name ?? "all catalog controls";

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`"${project.name}" — ${targetLabel}`}
      />

      <PageContent>
        {assessed.length > 0 ? (
          <RequirementsStatusChips
            counts={statusCounts}
            selected={statusFilter}
            presetId={selectedPresetId}
            defaultPresetId={defaultPresetId}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PageSection
            title="Assessed requirements"
            description={
              statusFilter
                ? `Showing ${filtered.length} requirement${filtered.length === 1 ? "" : "s"} with selected status.`
                : `${assessed.length} requirement${assessed.length === 1 ? "" : "s"} in this preset.`
            }
            className="lg:col-span-2"
          >
          {assessed.length === 0 ? (
            <EmptyState
              title="No requirements assessed yet"
              action={<PageActionLink href="/dashboard">Go to dashboard</PageActionLink>}
            >
              <p>
                Run an assessment from the dashboard to evaluate each in-scope
                requirement for this preset.
              </p>
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No requirements match this status"
              action={
                <PageActionLink href={requirementsPageHref({ presetId: selectedPresetId, defaultPresetId })}>
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
              project={project}
            />
          )}
          </PageSection>

          <aside aria-label="Preset navigation" className="lg:col-span-1">
            <PageSection
              title="Preset"
              description="Browse requirement scope by preset."
              className="border-t-0 pt-0"
            >
              <RequirementsPresetPanel
                defaultPresetId={defaultPresetId}
                selectedPresetId={selectedPresetId}
                statusFilter={statusFilter}
              />
            </PageSection>
          </aside>
        </div>
      </PageContent>
    </>
  );
}
