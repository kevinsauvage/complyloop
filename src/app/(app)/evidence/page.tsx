import { PaginationNav } from "@/components/pagination-nav";
import { EvidenceKindChips } from "@/components/evidence/evidence-kind-chips";
import { EvidenceKindBadge } from "@/components/badges";
import {
  EmptyState,
  NoProjectNotice,
  PageActionLink,
  PageContent,
  PageHeader,
} from "@/components/page-primitives";
import { formatDateTime } from "@/core/lifecycle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { evidenceRecordHref } from "@/core/filters";
import { EVIDENCE_TONE_DOT, evidenceDisplay } from "@/core/display";
import { parseEvidenceKindParam, evidenceKindHref } from "@/core/filters";
import { reportHref } from "@/core/filters";
import {
  DEFAULT_PAGE_SIZE,
  pageSliceFromQuery,
  parsePageParam,
} from "@/core/filters";
import { cn } from "@/lib/utils";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  countEvidenceForProject,
  countEvidenceKindsForProject,
  listEvidencePageForProject,
} from "@complyloop/db/repo/evidence";
import { getWorkspace } from "@/server/workspace";
import { listRequirementsForProject } from "@complyloop/db/repo/requirements";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evidence",
  description: "Append-only record of everything checked, found, changed, and verified.",
};

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string | string[] }>;
}) {
  const { page: pageRaw, kind: kindRaw } = await searchParams;
  const { project } = await getWorkspace();
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
  const page = parsePageParam(pageRaw);
  const drizzle = await getDrizzle();
  const [requirements, totalUnfiltered, total, kindCounts, items] = await Promise.all([
    listRequirementsForProject(drizzle, project.id),
    countEvidenceForProject(drizzle, project.id),
    countEvidenceForProject(drizzle, project.id, kindFilter),
    countEvidenceKindsForProject(drizzle, project.id),
    listEvidencePageForProject(
      drizzle,
      project.id,
      page,
      DEFAULT_PAGE_SIZE,
      kindFilter,
    ),
  ]);
  const slice = pageSliceFromQuery(items, page, total);
  const paginationQuery = kindFilter ? { kind: kindFilter } : undefined;

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Append-only log of every requirement check, finding, fix, and verification. Nothing here can be edited — only superseded."
      >
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" asChild>
            <a href={reportHref("audit", "markdown")} download>
              Download audit report
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More export formats">
                More formats <ChevronDownIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={reportHref("engineering", "markdown")} download>
                  <span className="flex flex-col gap-0.5">
                    <span>Download engineering report</span>
                    <span className="text-xs text-muted-foreground">
                      Markdown for developers fixing findings
                    </span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={reportHref("audit", "html")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="flex flex-col gap-0.5">
                    <span>Open audit report</span>
                    <span className="text-xs text-muted-foreground">
                      Auditor-ready HTML in a new tab
                    </span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={reportHref("engineering", "html")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="flex flex-col gap-0.5">
                    <span>Open engineering report</span>
                    <span className="text-xs text-muted-foreground">
                      HTML in a new tab
                    </span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/evidence/export" download="evidence.json">
                  <span className="flex flex-col gap-0.5">
                    <span>Download raw JSON</span>
                    <span className="text-xs text-muted-foreground">
                      Machine-readable export
                    </span>
                  </span>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>
      {totalUnfiltered === 0 ? (
        <PageContent>
          <EmptyState
            title="No evidence yet"
            variant="first-run"
            action={
              <PageActionLink href="/dashboard">Run assessment from dashboard</PageActionLink>
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
          <EvidenceKindChips counts={kindCounts} selected={kindFilter} />
          <h2
            id="evidence-results"
            tabIndex={-1}
            className="min-h-5 text-sm font-medium text-muted-foreground outline-none"
          >
            {total === 1 ? "1 entry" : `${total} entries`}
            {kindFilter ? ` · ${evidenceDisplay(kindFilter).label}` : ""}
          </h2>
          {total === 0 && kindFilter ? (
            <EmptyState title={`No "${evidenceDisplay(kindFilter).label}" entries`} variant="no-results">
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
                    const tone = evidenceDisplay(record.kind, record.detail).tone;
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
