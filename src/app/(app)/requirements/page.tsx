import type { Metadata } from "next";

import {
  EmptyState,
  NoProjectNotice,
  PageActionLink,
  PageContent,
  PageHeader,
  PageSection,
} from "@/components/page-primitives";
import { PaginationNav } from "@/components/pagination-nav";
import { AssessedRequirementList } from "@/components/requirements/assessed-requirement-list";
import { RequirementsPresetPanel } from "@/components/requirements/requirements-preset-panel";
import { RequirementsStatusChips } from "@/components/requirements/requirements-status-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadRequirementsView } from "@/server/workspace/project-view";

export const metadata: Metadata = {
  title: "Requirements",
  description: "Browse compliance requirements by framework preset and status.",
};

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    presetId?: string | string[];
    page?: string | string[];
    q?: string | string[];
  }>;
}) {
  const view = await loadRequirementsView(await searchParams);
  if (!view.project) {
    return (
      <NoProjectNotice
        title="Requirements"
        description="Connect a repository to browse requirements by preset."
        hint="Connect a repository from the dashboard to manage requirements."
      />
    );
  }

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
        description={`"${project.name}" — ${targetLabel}. Each requirement states what you must do; findings are its individual failures; evidence is the proof.`}
      />

      <PageContent>
        {/* Assessments always evaluate the project default preset —
            any other ?presetId= is browse-only until a re-assessment runs. */}
        {selectedPresetId !== defaultPresetId ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            Browse-only — run assessment to evaluate this preset.
          </div>
        ) : null}
        {assessed.length > 0 ? (
          <RequirementsStatusChips
            counts={statusCounts}
            selected={statusFilter}
            presetId={selectedPresetId}
            defaultPresetId={defaultPresetId}
            q={query}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PageSection
            title="Assessed requirements"
            description={
              query
                ? `Showing ${filteredControls.length} requirement${filteredControls.length === 1 ? "" : "s"} matching “${query}”.`
                : statusFilter
                  ? `Showing ${filtered.length} requirement${filtered.length === 1 ? "" : "s"} with selected status.`
                  : `${assessed.length} requirement${assessed.length === 1 ? "" : "s"} in this preset.`
            }
            className="lg:col-span-2"
          >
            {assessed.length > 0 ? (
              <form
                method="get"
                action="/requirements"
                role="search"
                aria-label="Search requirements"
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                {statusFilter ? (
                  <input type="hidden" name="status" value={statusFilter} />
                ) : null}
                {selectedPresetId !== defaultPresetId ? (
                  <input
                    type="hidden"
                    name="presetId"
                    value={selectedPresetId}
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="requirements-q">Search requirements</Label>
                  <Input
                    id="requirements-q"
                    name="q"
                    type="search"
                    defaultValue={query ?? ""}
                    placeholder="Search code or title…"
                    maxLength={100}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" size="sm" className="shrink-0">
                  Search
                </Button>
              </form>
            ) : null}
            {assessed.length === 0 ? (
              <EmptyState
                title="No requirements assessed yet"
                variant="first-run"
                action={
                  <PageActionLink href="/dashboard">
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
                  <PageActionLink href="/requirements">
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
                  frameworkId={frameworkId}
                  canRemediate={caps.canRemediate}
                  project={project}
                />
                <PaginationNav
                  page={page.page}
                  totalPages={page.totalPages}
                  total={page.total}
                  pageSize={page.pageSize}
                  basePath="/requirements"
                  query={paginationQuery}
                />
              </div>
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
                q={query}
              />
            </PageSection>
          </aside>
        </div>
      </PageContent>
    </>
  );
}
