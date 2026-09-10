import type { Metadata } from "next";
import Link from "next/link";

import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";

import { toFindingListItems } from "@/components/findings/finding-list-items";
import { FindingsBulkList } from "@/components/findings/findings-bulk-list";
import { FindingsClustersTab } from "@/components/findings/findings-clusters-tab";
import { FindingsFilterBar } from "@/components/findings/findings-filter-bar";
import { FindingsTabPanel } from "@/components/findings/findings-tab-panel";
import { FocusFilterResults } from "@/components/findings/focus-filter-results";
import {
  EmptyState,
  NoProjectNotice,
  PageActionLink,
  PageContent,
  PageHeader,
} from "@/components/page-primitives";
import { PaginationNav } from "@/components/pagination-nav";
import { Button } from "@/components/ui/button";
import {
  type FilterFindingsContext,
  findingListPaginationQuery,
  findingsListHref,
  type FindingsTab,
  hasActiveFindingFilters,
  orderFindingsForList,
  pageSliceFromQuery,
  parseFindingListParams,
} from "@/core/filter-params";
import { reportHref } from "@/core/filter-params";
import { DEFAULT_PAGE_SIZE,paginateSlice } from "@/core/filter-params";
import { clusterFindings,prioritizeClusters } from "@/core/finding-priority";
import { loadActiveProjectPage } from "@/server/active-project-page";
import { countFindingsByStatus } from "@/server/findings-queries";
import { getProjectRuntime } from "@/server/project-runtime";
import { findingsInScope } from "@/server/project-scope";
import { displayControl } from "@/server/report";

import { FindingsStatusNav } from "./_components/status-nav";

export const metadata: Metadata = {
  title: "Findings",
  description:
    "Every failure with its reason, location, remediation state, and evidence.",
};

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const listParams = parseFindingListParams(rawParams);
  const { project, caps } = await loadActiveProjectPage();
  if (!project) {
    return (
      <NoProjectNotice
        title="Findings"
        description="Every failure with its reason, location, remediation state, and evidence."
        hint="Connect a repository from the dashboard to see findings."
      />
    );
  }

  // Never rewrite the requested tab: a shared or bookmarked ?tab=open link
  // must render the open list (or its empty state), not silently jump to
  // another status.
  const activeTab: FindingsTab = listParams.tab;
  const statusForTab: FindingStatus =
    activeTab === "by_cause" ? "open" : activeTab;

  // Tab totals come from an index-only count so inherited history never inflates
  // the payload. Only open findings plus the active status load in full:
  // dashboard/requirements/finding pages only need open findings, and resolved
  // or dismissed rows are fetched only when their tab is actually viewed.
  const statusCounts = await countFindingsByStatus(project.id);
  const totalFindings =
    statusCounts.open + statusCounts.resolved + statusCounts.dismissed;
  const findingStatuses: FindingStatus[] =
    statusForTab === "open" ? ["open"] : ["open", statusForTab];

  const runtime = await getProjectRuntime(project.id, { findingStatuses });
  const findings = findingsInScope(runtime.findings, project);
  const remediationByFindingId = new Map(
    runtime.remediations.map((remediation) => [
      remediation.findingId,
      remediation,
    ]),
  );
  const controls = shippedCatalog().controls;
  const rawClusters = clusterFindings(findings, controls);
  const clusters = prioritizeClusters(findings, controls, rawClusters);
  const filterContext: FilterFindingsContext = {
    controls,
    remediationStatusFor: (findingId) =>
      remediationByFindingId.get(findingId)?.status,
    clusterFindingIds: listParams.cluster
      ? new Set(
          clusters.find((cluster) => cluster.id === listParams.cluster)
            ?.findingIds ?? [],
        )
      : undefined,
    clusters: rawClusters,
  };

  const byStatus = (status: FindingStatus): Finding[] =>
    orderFindingsForList(findings, status, listParams, filterContext);

  const openSlice = paginateSlice(byStatus("open"), listParams.page);
  // Inactive history tabs use the SQL count for their badge; their rows load
  // only when the tab is active, so the slice is intentionally empty.
  const resolvedSlice = findingStatuses.includes("resolved")
    ? paginateSlice(byStatus("resolved"), listParams.page)
    : pageSliceFromQuery<Finding>([], listParams.page, statusCounts.resolved);
  const dismissedSlice = findingStatuses.includes("dismissed")
    ? paginateSlice(byStatus("dismissed"), listParams.page)
    : pageSliceFromQuery<Finding>([], listParams.page, statusCounts.dismissed);
  const paginationQuery = findingListPaginationQuery(listParams);

  const listFor = (sliceFindings: Finding[]) => {
    return toFindingListItems(
      sliceFindings,
      (controlId) => displayControl(controlId, project),
      (findingId) => {
        const remediation = remediationByFindingId.get(findingId);
        if (!remediation) {
          throw new Error(`No remediation for finding ${findingId}`);
        }
        return remediation;
      },
    );
  };

  const hasAssessment = runtime.assessments.some(
    (assessment) => assessment.projectId === project.id,
  );

  if (totalFindings === 0) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="One finding = one instance of a failed requirement. Fix it to Verified — every step is kept as evidence."
        />
        <EmptyState
          title="No findings yet"
          variant="first-run"
          action={
            <PageActionLink href="/dashboard">
              Run assessment from dashboard
            </PageActionLink>
          }
        >
          <p>Run an assessment from the dashboard to detect compliance gaps.</p>
        </EmptyState>
      </>
    );
  }

  const filtersActive = hasActiveFindingFilters(listParams);

  function filteredEmptyState(tabLabel: string) {
    return (
      <EmptyState
        title="No findings match these filters"
        variant="no-results"
        action={
          <PageActionLink href={findingsListHref({ tab: listParams.tab })}>
            Reset filters
          </PageActionLink>
        }
      >
        <p>
          No {tabLabel} findings match the current search and filters. Reset to
          see the full list.
        </p>
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader
        title="Findings"
        description="One finding = one instance of a failed requirement. Fix it to Verified — every step is kept as evidence."
      >
        <Button variant="outline" size="sm" asChild>
          <a href={reportHref("engineering", "markdown")} download>
            Export engineering report
          </a>
        </Button>
      </PageHeader>

      <PageContent>
        <FindingsStatusNav
          listParams={listParams}
          activeTab={activeTab}
          totals={{
            open: openSlice.total,
            byCause: clusters.length,
            resolved: resolvedSlice.total,
            dismissed: dismissedSlice.total,
          }}
        />

        {activeTab === "resolved" ? (
          <FindingsTabPanel
            tab="resolved"
            slice={resolvedSlice}
            listParams={listParams}
            filtersActive={filtersActive}
            items={listFor(resolvedSlice.items)}
            emptyMessage="No resolved findings yet. Fixed findings appear here once verified."
            emptyAction={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <PageActionLink href={findingsListHref({ tab: "open" })}>
                  Review open findings
                </PageActionLink>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard">Run assessment</Link>
                </Button>
              </div>
            }
            filteredEmptyState={filteredEmptyState("resolved")}
            paginationQuery={paginationQuery}
            paginationLabel="Resolved findings pagination"
            resultCount={resolvedSlice.total}
            resultLabel="resolved"
          />
        ) : activeTab === "dismissed" ? (
          <FindingsTabPanel
            tab="dismissed"
            slice={dismissedSlice}
            listParams={listParams}
            filtersActive={filtersActive}
            items={listFor(dismissedSlice.items)}
            emptyMessage="No dismissed findings."
            emptyAction={
              <PageActionLink href={findingsListHref({ tab: "open" })}>
                Review open findings
              </PageActionLink>
            }
            filteredEmptyState={filteredEmptyState("dismissed")}
            paginationQuery={paginationQuery}
            paginationLabel="Dismissed findings pagination"
            resultCount={dismissedSlice.total}
            resultLabel="dismissed"
          />
        ) : activeTab === "by_cause" ? (
          <div className="mt-4 flex flex-col gap-4">
            <FindingsClustersTab clusters={clusters} findings={findings} />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <FindingsFilterBar
              params={{ ...listParams, tab: "open" }}
              controlLabel={
                listParams.control
                  ? controls.find(
                      (control) => control.id === listParams.control,
                    )?.code
                  : undefined
              }
            />
            <h2
              id="findings-results"
              tabIndex={-1}
              className="min-h-5 text-sm font-medium text-muted-foreground outline-none"
            >
              {openSlice.total === 1
                ? "1 open finding"
                : `${openSlice.total} open findings`}
            </h2>
            <FocusFilterResults targetId="findings-results" />
            {openSlice.total === 0 ? (
              filtersActive ? (
                filteredEmptyState("open")
              ) : hasAssessment ? (
                <EmptyState
                  title="No open findings"
                  variant="all-clear"
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <PageActionLink href="/requirements">
                        View requirements
                      </PageActionLink>
                      <Button variant="outline" size="sm" asChild>
                        <a href={reportHref("audit", "markdown")} download>
                          Export audit report
                        </a>
                      </Button>
                    </div>
                  }
                >
                  <p>
                    Everything detected has been fixed, verified, or reviewed.
                    Export an audit report for reviewers or check Requirements
                    for the full status picture.
                  </p>
                </EmptyState>
              ) : (
                <EmptyState title="No assessment yet" variant="first-run">
                  <p>
                    Run your first assessment from the dashboard to detect
                    findings. Evidence and findings will appear here.
                  </p>
                </EmptyState>
              )
            ) : (
              <>
                <FindingsBulkList
                  items={listFor(openSlice.items)}
                  canRemediate={caps.canRemediate}
                  listParams={{ ...listParams, tab: "open" }}
                />
                <PaginationNav
                  page={openSlice.page}
                  totalPages={openSlice.totalPages}
                  total={openSlice.total}
                  basePath="/findings"
                  query={paginationQuery}
                  label="Open findings pagination"
                  pageSize={DEFAULT_PAGE_SIZE}
                />
              </>
            )}
          </div>
        )}
      </PageContent>
    </>
  );
}
