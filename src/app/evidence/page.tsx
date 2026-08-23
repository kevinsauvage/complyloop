import { PaginationNav } from "@/components/pagination-nav";
import { EmptyState, PageHeader, formatDateTime } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EvidenceKind } from "@/core/finding-types";
import { paginateSlice, parsePageParam } from "@/core/pagination";
import { cn } from "@/lib/utils";
import { evidenceForProject } from "@/server/project-visibility";
import { getWorkspace } from "@/server/workspace";
import { ChevronDownIcon } from "lucide-react";

export const dynamic = "force-dynamic";

type EvidenceTone = "default" | "pass" | "fail" | "review" | "signal";

function evidenceTone(kind: EvidenceKind): EvidenceTone {
  switch (kind) {
    case "finding_resolved":
    case "remediation_verified":
    case "remediation_manually_verified":
    case "assessment_completed":
    case "assessment_job_completed":
    case "requirement_human_passed":
      return "pass";
    case "finding_detected":
    case "assessment_job_failed":
    case "monitoring_changes_detected":
      return "fail";
    case "finding_dismissed":
    case "requirement_exception_set":
    case "requirement_status_changed":
      return "review";
    case "remediation_approved":
    case "remediation_implemented":
    case "ai_remediation_suggested":
    case "pull_request_prepared":
    case "assessment_job_queued":
    case "webhook_reassessment":
      return "signal";
    case "project_connected":
    case "project_disconnected":
    case "project_reset":
    case "requirement_exception_cleared":
    case "requirement_human_pass_cleared":
    case "requirements_imported":
      return "default";
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled evidence kind: ${_exhaustive}`);
    }
  }
}

const TONE_DOT: Record<EvidenceTone, string> = {
  default: "bg-muted-foreground/40",
  pass: "bg-status-passed",
  fail: "bg-status-failed",
  review: "bg-status-review",
  signal: "bg-signal",
};

const TONE_BADGE: Record<EvidenceTone, string> = {
  default: "",
  pass: "border-transparent bg-status-passed/15 text-status-passed",
  fail: "border-transparent bg-status-failed/15 text-status-failed",
  review: "border-transparent bg-status-review/15 text-status-review",
  signal: "border-transparent bg-signal/15 text-signal",
};

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const { db, project } = await getWorkspace();
  if (!project) {
    return (
      <>
        <PageHeader
          title="Evidence"
          description="Append-only record of everything checked, found, changed, and verified."
        />
        <EmptyState title="No project connected">
          <p>Connect a repository from the dashboard to collect evidence.</p>
        </EmptyState>
      </>
    );
  }
  const evidence = [...evidenceForProject(db.evidence, project.id)].reverse();
  const slice = paginateSlice(evidence, parsePageParam(pageRaw));

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
              <a href="/evidence/report" download>
                Report (Markdown)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/evidence/report/html" target="_blank" rel="noreferrer">
                Report (HTML)
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
      {evidence.length === 0 ? (
        <EmptyState title="No evidence yet">
          Evidence accumulates as assessments run and remediations progress.
        </EmptyState>
      ) : (
        <Card className="shadow-none ring-1 ring-border/60">
          <CardContent className="p-0">
            <ol
              className="divide-y divide-border/60"
              aria-label="Evidence records"
            >
              {slice.items.map((record) => {
                const tone = evidenceTone(record.kind);
                return (
                  <li
                    key={record.id}
                    className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-accent/20"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2.5 shrink-0 rounded-full",
                        TONE_DOT[tone],
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-mono text-[10px]",
                            TONE_BADGE[tone],
                          )}
                        >
                          {record.kind}
                        </Badge>
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
              label="Evidence pagination"
            />
          </div>
        </Card>
      )}
    </>
  );
}
