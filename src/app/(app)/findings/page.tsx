import type { Metadata } from "next";
import Link from "next/link";

import type { Finding } from "@complyloop/analysis-core/contract/entities";

import {
  EmptyState,
  NoProjectNotice,
  PageActionLink,
  PageContent,
  PageHeader,
} from "@/components/primitives/page-primitives";
import { PaginationNav } from "@/components/primitives/pagination-nav";
import { Button } from "@/components/ui/button";
import { findingsListHref } from "@/core/filter-params";
import { reportHref } from "@/core/filter-params";
import { DEFAULT_PAGE_SIZE } from "@/core/filter-params";
import { displayControl } from "@/server/reporting/report";
import { loadFindingsView } from "@/server/workspace/findings-view";

import { toFindingListItems } from "./_components/finding-list-items";
import { FindingsBulkList } from "./_components/findings-bulk-list";
import { FindingsClustersTab } from "./_components/findings-clusters-tab";
import { FindingsFilterBar } from "./_components/findings-filter-bar";
import { FindingsTabPanel } from "./_components/findings-tab-panel";
import { FocusFilterResults } from "./_components/focus-filter-results";
import { FindingsStatusNav } from "./_components/status-nav";

export const metadata: Metadata = {
  title: "Findings",
  description:
    "Every finding with its reason, location, remediation state, and evidence.",
};

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = await loadFindingsView(await searchParams);
  if (!view.project) {
    return (
      <NoProjectNotice
        title="Findings"
        description="Every finding with its reason, location, remediation state, and evidence."
        hint="Connect a repository from the dashboard to see findings."
      />
    );
  }

  const {
    project,
    caps,
    listParams,
    activeTab,
    openSlice,
    resolvedSlice,
    dismissedSlice,
    clusters,
    findings,
    controls,
    remediationByFindingId,
    paginationQuery,
    filtersActive,
    hasAssessment,
    totalFindings,
  } = view;

  // Orphan findings (scoped re-assess, stale apply, manual DB edit)
  // must not 500 the whole page. They are skipped here and counted for the
  // non-blocking repair banner below; present remediations still render via
  // RemediationStatusBadge downstream.
  const orphanFindingIds: string[] = [];
  const listFor = (sliceFindings: Finding[]) => {
    const withRemediation = sliceFindings.filter((finding) => {
      if (remediationByFindingId.has(finding.id)) return true;
      orphanFindingIds.push(finding.id);
      return false;
    });
    return toFindingListItems(
      withRemediation,
      (controlId) => displayControl(controlId, project),
      (findingId) => {
        const remediation = remediationByFindingId.get(findingId);
        if (!remediation) throw new Error(`Missing remediation for ${findingId}`);
        return remediation;
      },
    );
  };

  // Resolve the visible tabs' items eagerly so the orphan count is known
  // before the banner renders.
  const openItems = listFor(openSlice.items);
  const resolvedItems =
    activeTab === "resolved" ? listFor(resolvedSlice.items) : [];
  const dismissedItems =
    activeTab === "dismissed" ? listFor(dismissedSlice.items) : [];

  if (totalFindings === 0) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="One finding = one instance of a failed requirement. Fix it to Verified — every step is kept as evidence."
        />
        <EmptyState
          title="No accessibility findings yet"
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
        {orphanFindingIds.length > 0 ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            {orphanFindingIds.length} finding
            {orphanFindingIds.length === 1 ? "" : "s"} missing remediation —
            re-assess to repair.
          </div>
        ) : null}
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
            items={resolvedItems}
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
            items={dismissedItems}
            emptyMessage="No dismissed findings yet. Dismissed findings are documented exceptions with a reason — they appear here once recorded."
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
                  items={openItems}
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
