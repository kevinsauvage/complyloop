import type { Metadata } from "next";
import Link from "next/link";

import { EvidenceKindBadge } from "@/components/badges";
import { EvidenceKindChips } from "@/components/evidence/evidence-kind-chips";
import {
  EmptyState,
  NoProjectNotice,
  PageActionLink,
  PageContent,
  PageHeader,
} from "@/components/page-primitives";
import { PaginationNav } from "@/components/pagination-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/core/datetime";
import { EVIDENCE_TONE_DOT, evidenceDisplay } from "@/core/display";
import { evidenceRecordHref } from "@/core/filter-params";
import {
  evidenceKindHref,
  parseEvidenceDateParam,
  parseEvidenceKindParam,
  parseEvidenceQueryParam,
} from "@/core/filter-params";
import {
  DEFAULT_PAGE_SIZE,
  pageSliceFromQuery,
  parsePageParam,
} from "@/core/filter-params";
import { cn } from "@/lib/utils";
import { loadActiveProjectPage } from "@/server/active-project-page";
import { loadEvidencePage } from "@/server/evidence-queries";

import { EvidenceExportMenu } from "./_components/evidence-export-menu";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Append-only record of everything checked, found, changed, and verified.",
};

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    kind?: string | string[];
    q?: string | string[];
    from?: string | string[];
    to?: string | string[];
    actor?: string | string[];
  }>;
}) {
  const {
    page: pageRaw,
    kind: kindRaw,
    q: qRaw,
    from: fromRaw,
    to: toRaw,
    actor: actorRaw,
  } = await searchParams;
  const { project } = await loadActiveProjectPage();
  if (!project) {
    return (
      <NoProjectNotice
        title="Evidence"
        description="Append-only record of everything checked, found, changed, and verified."
        hint="Connect a repository from the dashboard to collect evidence."
      />
    );
  }
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

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Append-only log of every requirement check, finding, fix, and verification. Nothing here can be edited — only superseded."
      >
        <EvidenceExportMenu />
      </PageHeader>
      {totalUnfiltered === 0 ? (
        <PageContent>
          <EmptyState
            title="No evidence yet"
            variant="first-run"
            action={
              <PageActionLink href="/dashboard">
                Run assessment from dashboard
              </PageActionLink>
            }
          >
            <p>
              Evidence accumulates as you run assessments, resolve findings,
              verify remediations, and record requirement decisions. After your
              first run you will see entries like assessment completed, finding
              detected, and remediation verified — each with a timestamp and
              link back into the loop.
            </p>
          </EmptyState>
        </PageContent>
      ) : (
        <PageContent>
          <EvidenceKindChips
            counts={kindCounts}
            selected={kindFilter}
            filters={filters}
          />
          <form
            method="get"
            action="/evidence"
            role="search"
            aria-label="Search evidence"
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            {kindFilter ? (
              <input type="hidden" name="kind" value={kindFilter} />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="evidence-q">Search evidence</Label>
              <Input
                id="evidence-q"
                name="q"
                type="search"
                defaultValue={query ?? ""}
                placeholder="Search summaries…"
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="evidence-from">From</Label>
              <Input
                id="evidence-from"
                name="from"
                type="date"
                defaultValue={from ?? ""}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="evidence-to">To</Label>
              <Input
                id="evidence-to"
                name="to"
                type="date"
                defaultValue={to ?? ""}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="evidence-actor">Author</Label>
              <Input
                id="evidence-actor"
                name="actor"
                type="search"
                defaultValue={actor ?? ""}
                placeholder="GitHub login or System…"
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <Button type="submit" size="sm" className="shrink-0">
              Search
            </Button>
          </form>
          <h2
            id="evidence-results"
            tabIndex={-1}
            className="min-h-5 text-sm font-medium text-muted-foreground outline-none"
          >
            {total === 1 ? "1 entry" : `${total} entries`}
            {kindFilter ? ` · ${evidenceDisplay(kindFilter).label}` : ""}
            {query ? ` · matching “${query}”` : ""}
            {from ? ` · from ${from}` : ""}
            {to ? ` · to ${to}` : ""}
            {actor ? ` · by ${actor}` : ""}
          </h2>
          {total === 0 && filtersActive ? (
            <EmptyState title="No matching entries" variant="no-results">
              <p>
                Try another search or date range, or{" "}
                <Link href={evidenceKindHref()} className="underline">
                  view all evidence
                </Link>
                .
              </p>
            </EmptyState>
          ) : total === 0 && kindFilter ? (
            <EmptyState
              title={`No "${evidenceDisplay(kindFilter).label}" entries`}
              variant="no-results"
            >
              <p>
                Try another filter or{" "}
                <Link href={evidenceKindHref()} className="underline">
                  view all evidence
                </Link>
                .
              </p>
            </EmptyState>
          ) : (
            <Card className="overflow-hidden shadow-none">
              <CardContent className="p-0">
                <ol
                  className="divide-y divide-border/60"
                  aria-label="Evidence records"
                >
                  {slice.items.map((record) => {
                    const tone = evidenceDisplay(
                      record.kind,
                      record.detail,
                    ).tone;
                    const href = evidenceRecordHref(record, requirements);
                    const rowClassName = cn(
                      "flex gap-3 px-4 py-3.5 transition-colors",
                      href
                        ? "hover:bg-accent/20 focus-within:bg-accent/20"
                        : "",
                    );
                    const content = (
                      <>
                        <span
                          className={cn(
                            "mt-1.5 size-2.5 shrink-0 rounded-full",
                            EVIDENCE_TONE_DOT[tone],
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <EvidenceKindBadge kind={record.kind} />
                            <time
                              dateTime={record.at}
                              className="text-xs text-muted-foreground whitespace-nowrap"
                            >
                              {formatDateTime(record.at)}
                            </time>
                            <span className="text-xs text-muted-foreground">
                              · {record.actor ?? "System"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {record.summary}
                          </p>
                        </div>
                      </>
                    );

                    return (
                      <li key={record.id}>
                        {href ? (
                          <Link href={href} className={rowClassName}>
                            {content}
                          </Link>
                        ) : (
                          <div className={rowClassName}>{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
              <div className="border-t border-border/60 px-4 py-3">
                <PaginationNav
                  page={slice.page}
                  totalPages={slice.totalPages}
                  total={slice.total}
                  basePath="/evidence"
                  query={paginationQuery}
                  label="Evidence pagination"
                  pageSize={DEFAULT_PAGE_SIZE}
                />
              </div>
            </Card>
          )}
        </PageContent>
      )}
    </>
  );
}
