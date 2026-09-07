import Link from "next/link";
import { FindingsClustersTab } from "@/components/findings/findings-clusters-tab";
import { FindingsFilterBar } from "@/components/findings/findings-filter-bar";
import { FindingsTabPanel } from "@/components/findings/findings-tab-panel";
import { FindingsBulkList } from "@/components/findings/findings-bulk-list";
import { toFindingListItems } from "@/components/findings/finding-list-items";
import { PaginationNav } from "@/components/pagination-nav";
import { EmptyState, PageActionLink, PageContent, PageHeader } from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  findingListPaginationQuery,
  findingsListHref,
  hasActiveFindingFilters,
  orderFindingsForList,
  parseFindingListParams,
  type FilterFindingsContext,
  type FindingsTab,
  type FindingListParams,
} from "@/core/finding-list-filter";
import { reportMarkdownHref } from "@/core/query";
import { paginateSlice } from "@/core/pagination";
import { prioritizeClusters } from "@/core/prioritization";
import { clusterFindings } from "@/core/root-cause";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";
import type { Finding } from "@complyloop/db/types";
import { projectCapabilities } from "@/server/project-capabilities";
import { findingsInScope } from "@/server/assessment-status";
import {
  controlById,
  getWorkspace,
} from "@/server/workspace";
import { getProjectRuntime } from "@/server/project-runtime";
import { frameworkForProject } from "@/server/report";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import { controlForDisplay } from "@complyloop/adapters/control-theme";

export const dynamic = "force-dynamic";

function tabHref(tab: FindingsTab, params: FindingListParams): string {
  return findingsListHref({ ...params, tab, page: 1 });
}

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const listParams = parseFindingListParams(rawParams);
  const { project, access, activeOrgId } = await getWorkspace();
  if (!project) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="Every failure with its reason, location, remediation state, and evidence."
        />
        <EmptyState
          title="No project connected"
          action={<PageActionLink href="/dashboard">Go to dashboard</PageActionLink>}
        >
          <p>Connect a repository from the dashboard to see findings.</p>
        </EmptyState>
      </>
    );
  }

  const runtime = await getProjectRuntime(project.id);
  const caps = projectCapabilities(project, access, activeOrgId);
  const findings = findingsInScope(runtime.findings, project);
  const remediationByFindingId = new Map(
    runtime.remediations.map((remediation) => [remediation.findingId, remediation]),
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
  const resolvedSlice = paginateSlice(byStatus("resolved"), listParams.page);
  const dismissedSlice = paginateSlice(byStatus("dismissed"), listParams.page);
  const paginationQuery = findingListPaginationQuery(listParams);

  const listFor = (sliceFindings: Finding[]) => {
    const frameworkId = frameworkForProject(project).id;
    return toFindingListItems(
      sliceFindings,
      (controlId) =>
        controlForDisplay(controlById(controlId), frameworkId),
      (findingId) => {
        const remediation = remediationByFindingId.get(findingId);
        if (!remediation) {
          throw new Error(`No remediation for finding ${findingId}`);
        }
        return remediation;
      },
    );
  };

  const defaultTab: FindingsTab =
    listParams.tab === "by_cause"
      ? "by_cause"
      : listParams.tab !== "open"
        ? listParams.tab
        : openSlice.total > 0
          ? "open"
          : resolvedSlice.total > 0
            ? "resolved"
            : dismissedSlice.total > 0
              ? "dismissed"
              : clusters.length > 0
                ? "by_cause"
                : "open";

  const hasAssessment = runtime.assessments.some(
    (assessment) => assessment.projectId === project.id,
  );

  if (findings.length === 0) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="Every failure with its reason, location, remediation state, and evidence."
        />
        <EmptyState
          title="No findings yet"
          action={<PageActionLink href="/dashboard">Go to dashboard</PageActionLink>}
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
        description="Every failure with its reason, location, remediation state, and evidence."
      >
        <Button variant="outline" size="sm" asChild>
          <a href={reportMarkdownHref("engineering")} download>
            Export engineering report
          </a>
        </Button>
      </PageHeader>

      <PageContent>
        <Tabs key={defaultTab} defaultValue={defaultTab}>
          <TabsList className="surface-panel w-full justify-start rounded-xl p-1">
            <TabsTrigger value="open" asChild>
              <Link href={tabHref("open", listParams)}>
                Open{openSlice.total > 0 ? ` (${openSlice.total})` : ""}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="by_cause" asChild>
              <Link href={tabHref("by_cause", listParams)}>
                By cause
                {clusters.length > 0 ? ` (${clusters.length})` : ""}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="resolved" asChild>
              <Link href={tabHref("resolved", listParams)}>
                Resolved
                {resolvedSlice.total > 0 ? ` (${resolvedSlice.total})` : ""}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="dismissed" asChild>
              <Link href={tabHref("dismissed", listParams)}>
                Dismissed
                {dismissedSlice.total > 0 ? ` (${dismissedSlice.total})` : ""}
              </Link>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4 flex flex-col gap-4">
            <FindingsFilterBar params={{ ...listParams, tab: "open" }} />
            {openSlice.total === 0 ? (
              filtersActive ? (
                filteredEmptyState("open")
              ) : hasAssessment ? (
                <EmptyState
                  title="No open findings"
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <PageActionLink href="/requirements">
                        View requirements
                      </PageActionLink>
                      <Button variant="outline" size="sm" asChild>
                        <a href={reportMarkdownHref("audit")} download>
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
                <p className="text-sm text-muted-foreground">No open findings.</p>
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
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="by_cause" className="mt-4">
            <FindingsClustersTab clusters={clusters} findings={findings} />
          </TabsContent>

          <FindingsTabPanel
            tab="resolved"
            slice={resolvedSlice}
            listParams={listParams}
            filtersActive={filtersActive}
            items={listFor(resolvedSlice.items)}
            emptyMessage="No resolved findings."
            filteredEmptyState={filteredEmptyState("resolved")}
            paginationQuery={paginationQuery}
            paginationLabel="Resolved findings pagination"
          />

          <FindingsTabPanel
            tab="dismissed"
            slice={dismissedSlice}
            listParams={listParams}
            filtersActive={filtersActive}
            items={listFor(dismissedSlice.items)}
            emptyMessage="No dismissed findings."
            filteredEmptyState={filteredEmptyState("dismissed")}
            paginationQuery={paginationQuery}
            paginationLabel="Dismissed findings pagination"
          />
        </Tabs>
      </PageContent>
    </>
  );
}
