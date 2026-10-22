import type { Metadata } from "next";

import {
  EmptyState,
  PageActionLink,
  PageContent,
  PageHeader,
  PageSection,
} from "@/components/primitives/page-primitives";
import { PaginationNav } from "@/components/primitives/pagination-nav";
import {
  ActiveFilterChip,
  SearchFilterBar,
} from "@/components/primitives/search-filter-bar";
import { requirementsPageHref } from "@/core/filter-params/requirements";
import { projectPath } from "@/core/routes";
import { loadRequirementsView } from "@/server/workspace/requirements-view";

import { AssessedRequirementList } from "./_components/assessed-requirement-list";
import { RequirementsScopeNote } from "./_components/requirements-scope-note";
import { RequirementsStatusChips } from "./_components/requirements-status-chips";

export const metadata: Metadata = {
  title: "Requirements",
  description: "Browse compliance requirements by framework preset and status.",
};

export default async function RequirementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    status?: string | string[];
    page?: string | string[];
    q?: string | string[];
  }>;
}) {
  const { projectId } = await params;
  const view = await loadRequirementsView(projectId, await searchParams);

  const {
    project,
    caps,
    statusFilter,
    query,
    defaultPresetId,
    selectedPresetId,
    frameworkId,
    assessed,
    statusCounts,
    openFindingCounts,
    maskedFindingCounts,
    lapsedExceptionControlIds,
    filtered,
    filteredControls,
    page,
    pageRequirements,
    paginationQuery,
    targetLabel,
  } = view;

  return (
    <>
      <PageHeader
        title="Requirements"
        description={`"${project.name}" — ${targetLabel}. Each requirement states what you must do; findings are its individual instances; evidence is the proof.`}
      />

      <PageContent>
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside
            aria-label="Requirement filters"
            className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:gap-6 lg:overflow-y-auto"
          >
            {assessed.length > 0 ? (
              <RequirementsStatusChips
                projectId={projectId}
                counts={statusCounts}
                selected={statusFilter}
                presetId={selectedPresetId}
                defaultPresetId={defaultPresetId}
                q={query}
              />
            ) : null}
            <RequirementsScopeNote
              projectId={projectId}
              scopeName={targetLabel}
            />
          </aside>

          <PageSection
            title="Assessed requirements"
            description={
              query
                ? `Showing ${filteredControls.length} requirement${filteredControls.length === 1 ? "" : "s"} matching “${query}”.`
                : statusFilter
                  ? `Showing ${filtered.length} requirement${filtered.length === 1 ? "" : "s"} with selected status.`
                  : `${assessed.length} requirement${assessed.length === 1 ? "" : "s"} in this preset.`
            }
            className="min-w-0 border-t-0 pt-0"
          >
            {assessed.length > 0 ? (
              <SearchFilterBar
                action={projectPath(projectId, "requirements")}
                label="Search requirements"
                inputId="requirements-q"
                placeholder="Search code or title…"
                defaultValue={query}
                hiddenFields={{ status: statusFilter }}
                activeChips={
                  query
                    ? [
                        <ActiveFilterChip
                          key="q"
                          href={requirementsPageHref({
                            projectId,
                            presetId: selectedPresetId,
                            status: statusFilter,
                            defaultPresetId,
                          })}
                          clearLabel={`Clear search filter ${query}`}
                        >
                          <span className="max-w-48 truncate">“{query}”</span>
                        </ActiveFilterChip>,
                      ]
                    : []
                }
                resetHref={requirementsPageHref({
                  projectId,
                  presetId: selectedPresetId,
                  status: statusFilter,
                  defaultPresetId,
                })}
              />
            ) : null}
            {assessed.length === 0 ? (
              <EmptyState
                title="No requirements assessed yet"
                variant="first-run"
                action={
                  <PageActionLink href={projectPath(projectId, "dashboard")}>
                    Run assessment from dashboard
                  </PageActionLink>
                }
              >
                <p>
                  Run an assessment from the dashboard to evaluate each in-scope
                  requirement for this preset.
                </p>
              </EmptyState>
            ) : filteredControls.length === 0 ? (
              <EmptyState
                title={
                  query
                    ? `No requirements match “${query}”`
                    : "No requirements match this status"
                }
                variant="no-results"
                action={
                  <PageActionLink href={projectPath(projectId, "requirements")}>
                    Clear filter
                  </PageActionLink>
                }
              >
                <p>
                  Try another search or status chip, or clear the filter to see
                  the full assessed list.
                </p>
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-4">
                <AssessedRequirementList
                  controls={page.items}
                  requirements={pageRequirements}
                  openFindingCounts={openFindingCounts}
                  maskedFindingCounts={maskedFindingCounts}
                  lapsedExceptionControlIds={lapsedExceptionControlIds}
                  frameworkId={frameworkId}
                  canDecide={caps.canDecide}
                  project={project}
                />
                <PaginationNav
                  page={page.page}
                  totalPages={page.totalPages}
                  total={page.total}
                  pageSize={page.pageSize}
                  basePath={projectPath(projectId, "requirements")}
                  query={paginationQuery}
                />
              </div>
            )}
          </PageSection>
        </div>
      </PageContent>
    </>
  );
}
