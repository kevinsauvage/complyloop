import type { Metadata } from "next";
import Link from "next/link";

import { EvidenceKindBadge } from "@/components/primitives/badges";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import {
  EmptyState,
  PageActionLink,
  PageContent,
  PageHeader,
} from "@/components/primitives/page-primitives";
import { PaginationNav } from "@/components/primitives/pagination-nav";
import {
  ActiveFilterChip,
  FilterField,
  SearchFilterBar,
} from "@/components/primitives/search-filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EVIDENCE_TONE_DOT, evidenceDisplay } from "@/core/display/evidence";
import { evidenceRecordHref } from "@/core/filter-params/evidence";
import { evidenceKindHref } from "@/core/filter-params/evidence";
import { DEFAULT_PAGE_SIZE } from "@/core/filter-params/pagination";
import { projectPath } from "@/core/routes";
import { cn } from "@/lib/utils";
import { loadEvidenceView } from "@/server/workspace/evidence-view";

import { EvidenceExportMenu } from "./_components/evidence-export-menu";
import { EvidenceKindChips } from "./_components/evidence-kind-chips";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Append-only record of everything checked, found, changed, and verified.",
};

export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    page?: string | string[];
    kind?: string | string[];
    q?: string | string[];
    from?: string | string[];
    to?: string | string[];
    actor?: string | string[];
  }>;
}) {
  const { projectId } = await params;
  const view = await loadEvidenceView(projectId, await searchParams);

  const {
    kindFilter,
    query,
    from,
    to,
    actor,
    filters,
    requirements,
    kindCounts,
    totalUnfiltered,
    total,
    slice,
    paginationQuery,
    filtersActive,
  } = view;

  const without = (omit: keyof typeof filters) =>
    evidenceKindHref(projectId, kindFilter, undefined, {
      ...filters,
      [omit]: undefined,
    });
  const evidenceChips = [
    query ? (
      <ActiveFilterChip
        key="q"
        href={without("q")}
        clearLabel={`Clear search filter ${query}`}
      >
        <span className="max-w-48 truncate">“{query}”</span>
      </ActiveFilterChip>
    ) : null,
    from ? (
      <ActiveFilterChip
        key="from"
        href={without("from")}
        clearLabel={`Clear from date ${from}`}
      >
        From {from}
      </ActiveFilterChip>
    ) : null,
    to ? (
      <ActiveFilterChip
        key="to"
        href={without("to")}
        clearLabel={`Clear to date ${to}`}
      >
        To {to}
      </ActiveFilterChip>
    ) : null,
    actor ? (
      <ActiveFilterChip
        key="actor"
        href={without("actor")}
        clearLabel={`Clear author filter ${actor}`}
      >
        Author: {actor}
      </ActiveFilterChip>
    ) : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Append-only log of every requirement check, finding, fix, and verification. Nothing here can be edited — only superseded."
      >
        <EvidenceExportMenu projectId={projectId} />
      </PageHeader>
      {totalUnfiltered === 0 ? (
        <PageContent>
          <EmptyState
            title="No evidence yet"
            variant="first-run"
            action={
              <PageActionLink href={projectPath(projectId, "dashboard")}>
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
          <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <EvidenceKindChips
              projectId={projectId}
              counts={kindCounts}
              selected={kindFilter}
              filters={filters}
            />
            <div className="flex min-w-0 flex-col gap-4">
              <SearchFilterBar
                action={projectPath(projectId, "evidence")}
                label="Search evidence"
                inputId="evidence-q"
                placeholder="Search summaries…"
                defaultValue={query}
                hiddenFields={{ kind: kindFilter }}
                activeChips={evidenceChips}
                resetHref={evidenceKindHref(projectId, kindFilter)}
              >
                <FilterField id="evidence-from" label="From">
                  <Input
                    id="evidence-from"
                    name="from"
                    type="date"
                    defaultValue={from ?? ""}
                  />
                </FilterField>
                <FilterField id="evidence-to" label="To">
                  <Input
                    id="evidence-to"
                    name="to"
                    type="date"
                    defaultValue={to ?? ""}
                  />
                </FilterField>
                <FilterField id="evidence-actor" label="Author">
                  <Input
                    id="evidence-actor"
                    name="actor"
                    type="search"
                    defaultValue={actor ?? ""}
                    placeholder="GitHub login or System…"
                    maxLength={100}
                    autoComplete="off"
                  />
                </FilterField>
              </SearchFilterBar>
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
                    <Link
                      href={evidenceKindHref(projectId)}
                      className="underline"
                    >
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
                    <Link
                      href={evidenceKindHref(projectId)}
                      className="underline"
                    >
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
                        const href = evidenceRecordHref(
                          projectId,
                          record,
                          requirements,
                        );
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
                                <FormattedDateTime
                                  iso={record.at}
                                  className="text-xs text-muted-foreground whitespace-nowrap"
                                />
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
                      basePath={projectPath(projectId, "evidence")}
                      query={paginationQuery}
                      label="Evidence pagination"
                      pageSize={DEFAULT_PAGE_SIZE}
                    />
                  </div>
                </Card>
              )}
            </div>
          </div>
        </PageContent>
      )}
    </>
  );
}
