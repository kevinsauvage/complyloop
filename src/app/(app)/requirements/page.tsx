import { AssessedRequirementList } from "@/components/requirements/assessed-requirement-list";
import { RequirementsPresetPanel } from "@/components/requirements/requirements-preset-panel";
import { RequirementsStatusChips } from "@/components/requirements/requirements-status-chips";
import { EmptyState, NoProjectNotice, PageActionLink, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import {
  defaultConnectPreset,
  isValidPresetId,
  presetById,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/adapters/registry";
import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import {
  parsePresetIdParam,
  requirementsPageHref,
} from "@/core/filters";
import {
  parseRequirementStatusParam,
} from "@/core/filters";
import { countByStatus, toCountMap } from "@/core/lifecycle";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";
import { getProjectRuntime } from "@/server/project-runtime";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Requirements",
  description: "Browse compliance requirements by framework preset and status.",
};

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
  const urlPresetId = parsePresetIdParam(params.presetId, isValidPresetId);
  const { project, access, activeOrgId } = await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  if (!project) {
    return (
      <NoProjectNotice
        title="Requirements"
        description="Connect a repository to browse requirements by preset."
        hint="Connect a repository from the dashboard to manage requirements."
      />
    );
  }

  const runtime = await getProjectRuntime(project.id, {
    findingStatuses: ["open"],
  });
  const defaultPresetId = projectDefaultPresetId(project);
  const selectedPresetId = urlPresetId ?? defaultPresetId;
  const selectedPreset = presetById(selectedPresetId);
  const frameworkId =
    selectedPreset?.frameworkId ?? defaultConnectPreset().frameworkId;

  const requirements = runtime.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const presetControls = controlsForPreset(
    shippedCatalog().controls,
    selectedPresetId,
  );
  const inScopeIds = new Set(presetControls.map((control) => control.id));
  const assessed = requirements.filter((requirement) =>
    inScopeIds.has(requirement.controlId),
  );

  const openFindingCounts = toCountMap(
    runtime.findings.filter((finding) => finding.projectId === project.id && finding.status === "open"),
    (finding) => finding.controlId,
  );

  const statusCounts = countByStatus(assessed, REQUIREMENT_STATUSES);

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
        description={`"${project.name}" — ${targetLabel}. Each requirement states what you must do; findings are its individual failures; evidence is the proof.`}
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
                variant="first-run"
                action={<PageActionLink href="/dashboard">Run assessment from dashboard</PageActionLink>}
              >
                <p>
                  Run an assessment from the dashboard to evaluate each in-scope
                  requirement for this preset.
                </p>
              </EmptyState>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No requirements match this status"
                variant="no-results"
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
              title="Framework scope"
              description="Browse requirements by framework."
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
