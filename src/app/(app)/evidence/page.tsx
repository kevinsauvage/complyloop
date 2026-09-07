import { PaginationNav } from "@/components/pagination-nav";
import { EvidenceKindChips } from "@/components/evidence/evidence-kind-chips";
import { EvidenceKindBadge } from "@/components/badges";
import {
  EmptyState,
  PageActionLink,
  PageContent,
  PageHeader,
  formatDateTime,
} from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { evidenceRecordHref } from "@/core/query";
import { EVIDENCE_TONE_DOT, evidenceTone } from "@/core/status-display";
import { parseEvidenceKindParam, evidenceKindHref } from "@/core/query";
import { evidenceKindLabel } from "@/core/status-display";
import { reportHtmlHref, reportMarkdownHref } from "@/core/query";
import {
  DEFAULT_PAGE_SIZE,
  pageSliceFromQuery,
  parsePageParam,
} from "@/core/pagination";
import { cn } from "@/lib/utils";
import { getDrizzle } from "@complyloop/db/client";
import {
  countEvidenceForProject,
  countEvidenceKindsForProject,
  listEvidencePageForProject,
} from "@complyloop/db/repo/evidence";
import { getWorkspace } from "@/server/workspace";
import { listRequirementsForProject } from "@complyloop/db/repo/requirements";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string | string[] }>;
}) {
  const { page: pageRaw, kind: kindRaw } = await searchParams;
  const { project } = await getWorkspace();
  if (!project) {
    return (
      <>
        <PageHeader
          title="Evidence"
          description="Append-only record of everything checked, found, changed, and verified."
        />
        <EmptyState
          title="No project connected"
          action={<PageActionLink href="/dashboard">Go to dashboard</PageActionLink>}
        >
          <p>Connect a repository from the dashboard to collect evidence.</p>
        </EmptyState>
      </>
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
        description="Append-only record of everything checked, found, changed, and verified."
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Export <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={reportMarkdownHref("engineering")} download>
                Engineering (Markdown)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={reportMarkdownHref("audit")} download>
                Audit (Markdown)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={reportHtmlHref("engineering")}
                target="_blank"
                rel="noreferrer"
              >
                Engineering (HTML)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={reportHtmlHref("audit")} target="_blank" rel="noreferrer">
                Audit (HTML)
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/evidence/export" download="evidence.json">
                Export JSON
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>
      {totalUnfiltered === 0 ? (
        <EmptyState
          title="No evidence yet"
          action={
            <PageActionLink href="/dashboard">Run an assessment from the dashboard</PageActionLink>
          }
        >
          <p>
            Evidence accumulates as you run assessments, resolve Findings, verify
            Remediations, and record Requirement decisions. After your first run you
            will see entries like assessment completed, finding detected, and
            remediation verified — each with a timestamp and link back into the loop.
          </p>
        </EmptyState>
      ) : (
        <PageContent>
          <EvidenceKindChips counts={kindCounts} selected={kindFilter} />
          {total === 0 && kindFilter ? (
            <EmptyState title={`No ${evidenceKindLabel(kindFilter).toLowerCase()} evidence`}>
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
                    const tone = evidenceTone(record.kind, record.detail);
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
                />
              </div>
            </Card>
          )}
        </PageContent>
      )}
    </>
  );
}
