/**
 * Findings list view loader — data-shaping for the `(app)/findings` route.
 * Split from the former `project-view.ts` god-loader: one loader per route,
 * pages stay routing + rendering (no JSX here).
 */
import "server-only";

import { cache } from "react";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import { listLatestAssessmentForProject } from "@complyloop/db/repo/assessments";
import {
  countFindingsByStatusForList,
  countFindingsByStatusForProject,
  listFindingsPageForProject,
} from "@complyloop/db/repo/findings";
import { listRemediationsForFindings } from "@complyloop/db/repo/remediations";

import {
  type FilterFindingsContext,
  findingListPaginationQuery,
  type FindingListParams,
  type FindingsTab,
  hasActiveFindingFilters,
  orderFindingsForList,
  type PageSlice,
  pageSliceFromQuery,
  paginateSlice,
  parseFindingListParams,
} from "@/core/filter-params";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import { findingsInScope } from "@/server/workspace/project-scope";

export type FindingsView =
  | { project: null }
  | {
      project: Project;
      caps: ProjectCapabilities;
      listParams: FindingListParams;
      activeTab: FindingsTab;
      statusCounts: { open: number; resolved: number; dismissed: number };
      totalFindings: number;
      /**
       * True when the findings load hit `FINDINGS_LIST_LOAD_LIMIT`: the page
       * shows the most severe findings and the counts stay exact — the UI
       * must tell the user to refine filters instead of paging a partial set.
       */
      findingsTruncated: boolean;
      openSlice: PageSlice<Finding>;
      resolvedSlice: PageSlice<Finding>;
      dismissedSlice: PageSlice<Finding>;
      findings: Finding[];
      controls: readonly Control[];
      remediationByFindingId: Map<string, Remediation>;
      paginationQuery: Record<string, string>;
      filtersActive: boolean;
      hasAssessment: boolean;
    };

/**
 * Index-only tab totals, memoized per request like the rest of the loaders.
 */
const countFindingsByStatus = cache(async (projectId: string) =>
  countFindingsByStatusForProject(await getDrizzle(), projectId),
);

/**
 * Everything the findings list page renders, derived in one place. Two paths:
 *
 * - Fast path (no free-text search): the active tab's page plus exact totals
 *   come straight from SQL (`ORDER BY severity_rank, id`), with remediations
 *   loaded for the page rows only. No full loads.
 * - Fallback (free-text search matches catalog text SQL cannot see): the
 *   bounded status-scoped load with JS filter/sort/paginate, truncation
 *   flagged via the exact SQL counts.
 *
 * Both paths implement the same severity-first order, so pages never disagree.
 * Item mapping (`toFindingListItems`) stays in the page next to its component
 * imports.
 */
export async function loadFindingsView(
  rawParams: Record<string, string | string[] | undefined>,
): Promise<FindingsView> {
  const listParams = parseFindingListParams(rawParams);
  const { project, caps } = await loadActiveProjectPage();
  if (!project) return { project: null };

  // Never rewrite the requested tab: a shared or bookmarked ?tab=open link
  // must render the open list (or its empty state), not silently jump to
  // another status.
  const activeTab: FindingsTab = listParams.tab;
  const statusForTab: FindingStatus = activeTab;

  const needsJsFiltering = Boolean(listParams.q);
  if (!needsJsFiltering) {
    return loadFindingsViewFast(project, caps, listParams, activeTab);
  }

  // Tab totals come from an index-only count so inherited history never inflates
  // the payload. Only open findings plus the active status load in full:
  // dashboard/requirements/finding pages only need open findings, and resolved
  // or dismissed rows are fetched only when their tab is actually viewed.
  // The count and the runtime load need only the project id — overlap them.
  const findingStatuses: FindingStatus[] =
    statusForTab === "open" ? ["open"] : ["open", statusForTab];
  const [statusCounts, runtime] = await Promise.all([
    countFindingsByStatus(project.id),
    getProjectRuntime(project.id, { findingStatuses }),
  ]);
  const totalFindings =
    statusCounts.open + statusCounts.resolved + statusCounts.dismissed;

  const findings = findingsInScope(runtime.findings, project);
  // The row load is capped (`FINDINGS_LIST_LOAD_LIMIT`, most severe first);
  // compare against the exact SQL counts so truncation is surfaced, never
  // silent. Only the loaded statuses can be truncated.
  const loadedByStatus = new Map<FindingStatus, number>();
  for (const finding of findings) {
    loadedByStatus.set(
      finding.status,
      (loadedByStatus.get(finding.status) ?? 0) + 1,
    );
  }
  const findingsTruncated =
    statusCounts.open > (loadedByStatus.get("open") ?? 0) ||
    (statusForTab !== "open" &&
      statusCounts[statusForTab] > (loadedByStatus.get(statusForTab) ?? 0));

  const remediationByFindingId = new Map(
    runtime.remediations.map((remediation) => [
      remediation.findingId,
      remediation,
    ]),
  );
  const controls = shippedCatalog().controls;
  const filterContext: FilterFindingsContext = {
    controls,
    remediationStatusFor: (findingId) =>
      remediationByFindingId.get(findingId)?.status,
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

  const hasAssessment = runtime.assessments.some(
    (assessment) => assessment.projectId === project.id,
  );

  return {
    project,
    caps,
    listParams,
    activeTab,
    statusCounts,
    totalFindings,
    findingsTruncated,
    openSlice,
    resolvedSlice,
    dismissedSlice,
    findings,
    controls,
    remediationByFindingId,
    paginationQuery,
    filtersActive: hasActiveFindingFilters(listParams),
    hasAssessment,
  };
}

/**
 * SQL fast path: the active tab's page plus exact totals come straight from
 * the database — no full loads. Only status/severity/control filters are
 * SQL-expressible; free-text, remediation, and engine filters take the
 * bounded fallback above. Remediations load for the page rows only.
 */
async function loadFindingsViewFast(
  project: Project,
  caps: ProjectCapabilities,
  listParams: FindingListParams,
  activeTab: FindingsTab,
): Promise<FindingsView> {
  const statusForTab: FindingStatus = activeTab;
  const sqlFilters = {
    severity: listParams.severity,
    controlId: listParams.control,
    engine: listParams.engine,
    remediation: listParams.remediation,
  };
  const drizzle = await getDrizzle();
  const [statusCounts, filteredCounts, page, latestAssessments] =
    await Promise.all([
      countFindingsByStatus(project.id),
      countFindingsByStatusForList(drizzle, project.id, sqlFilters),
      listFindingsPageForProject(drizzle, project.id, {
        statuses: [statusForTab],
        ...sqlFilters,
        page: listParams.page,
      }),
      listLatestAssessmentForProject(drizzle, project.id),
    ]);
  const pageRemediations = await listRemediationsForFindings(
    drizzle,
    page.rows.map((finding) => finding.id),
  );
  const remediationByFindingId = new Map(
    pageRemediations.map((remediation) => [remediation.findingId, remediation]),
  );
  const sliceFor = (status: FindingStatus): PageSlice<Finding> =>
    status === statusForTab
      ? pageSliceFromQuery<Finding>(page.rows, listParams.page, page.total)
      : pageSliceFromQuery<Finding>(
          [],
          listParams.page,
          filteredCounts[status],
        );
  return {
    project,
    caps,
    listParams,
    activeTab,
    statusCounts,
    totalFindings:
      statusCounts.open + statusCounts.resolved + statusCounts.dismissed,
    findingsTruncated: false,
    openSlice: sliceFor("open"),
    resolvedSlice: sliceFor("resolved"),
    dismissedSlice: sliceFor("dismissed"),
    findings: [],
    controls: shippedCatalog().controls,
    remediationByFindingId,
    paginationQuery: findingListPaginationQuery(listParams),
    filtersActive: hasActiveFindingFilters(listParams),
    hasAssessment: latestAssessments.some(
      (assessment) => assessment.projectId === project.id,
    ),
  };
}
