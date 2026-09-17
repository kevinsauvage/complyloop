/**
 * Evidence view loader — data-shaping for the `(app)/evidence` route.
 *
 * Split from the former `project-view.ts` god-loader: one loader module per
 * route. Pages stay routing + rendering: they parse params, call exactly one
 * loader here, and render. No JSX here.
 */
import "server-only";

import type {
  EvidenceKind,
  EvidenceRecord,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { DEFAULT_PAGE_SIZE } from "@complyloop/analysis-core/contract/project-types";

import {
  type PageSlice,
  pageSliceFromQuery,
  parseEvidenceDateParam,
  parseEvidenceKindParam,
  parseEvidenceQueryParam,
  parsePageParam,
} from "@/core/filter-params";
import {
  loadEvidencePage,
} from "@/server/reporting/evidence-queries";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";

export type EvidenceView =
  | { project: null }
  | {
      project: Project;
      kindFilter: ReturnType<typeof parseEvidenceKindParam>;
      query: string | undefined;
      from: string | undefined;
      to: string | undefined;
      actor: string | undefined;
      filters: {
        q: string | undefined;
        from: string | undefined;
        to: string | undefined;
        actor: string | undefined;
      };
      page: number;
      requirements: Requirement[];
      kindCounts: Map<EvidenceKind, number>;
      items: EvidenceRecord[];
      filteredTotal: number | null;
      totalUnfiltered: number;
      total: number;
      slice: PageSlice<EvidenceRecord>;
      paginationQuery: Record<string, string>;
      filtersActive: boolean;
    };

/**
 * Everything the evidence page renders: parsed filters, the evidence window
 * query, and totals derived without extra `count(*)` scans.
 */
export async function loadEvidenceView(
  rawParams: Record<string, string | string[] | undefined>,
): Promise<EvidenceView> {
  const {
    page: pageRaw,
    kind: kindRaw,
    q: qRaw,
    from: fromRaw,
    to: toRaw,
    actor: actorRaw,
  } = rawParams;
  const { project } = await loadActiveProjectPage();
  if (!project) return { project: null };

  const kindFilter = parseEvidenceKindParam(kindRaw);
  const query = parseEvidenceQueryParam(qRaw);
  const from = parseEvidenceDateParam(fromRaw);
  const to = parseEvidenceDateParam(toRaw);
  const actor = parseEvidenceQueryParam(actorRaw);
  const filters = { q: query, from, to, actor };
  const hasTextOrDateFilter =
    query !== undefined ||
    from !== undefined ||
    to !== undefined ||
    actor !== undefined;
  const page = parsePageParam(pageRaw);
  const { requirements, kindCounts, items, filteredTotal } =
    await loadEvidencePage(
      project.id,
      page,
      DEFAULT_PAGE_SIZE,
      { kind: kindFilter, ...filters },
      hasTextOrDateFilter,
    );
  // The unfiltered total is the sum of the per-kind counts; the kind-only
  // total is one bucket — no extra count(*) scans needed.
  const totalUnfiltered = [...kindCounts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const total =
    filteredTotal ??
    (kindFilter ? (kindCounts.get(kindFilter) ?? 0) : totalUnfiltered);
  const slice = pageSliceFromQuery(items, page, total);
  const paginationQuery: Record<string, string> = {};
  if (kindFilter) paginationQuery.kind = kindFilter;
  if (query) paginationQuery.q = query;
  if (from) paginationQuery.from = from;
  if (to) paginationQuery.to = to;
  if (actor) paginationQuery.actor = actor;
  const filtersActive = kindFilter !== undefined || hasTextOrDateFilter;

  return {
    project,
    kindFilter,
    query,
    from,
    to,
    actor,
    filters,
    page,
    requirements,
    kindCounts,
    items,
    filteredTotal,
    totalUnfiltered,
    total,
    slice,
    paginationQuery,
    filtersActive,
  };
}
