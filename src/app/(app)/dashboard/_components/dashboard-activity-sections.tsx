import {
  ArrowRight,
  ArrowUpRight,
  FileSearch,
  GitCommitHorizontal,
  History,
  Layers,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import type {
  EvidenceRecord,
  FileChange,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";

import { SeverityBadge } from "@/components/primitives/badges";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EVIDENCE_TONE_DOT,
  evidenceDisplay,
  requirementStatusDisplay,
} from "@/core/display";
import { cn } from "@/lib/utils";

function ActivityCard({
  title,
  description,
  action,
  children,
  className,
  icon: Icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className={cn("border-border/70 shadow-none", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal/10 text-signal">
                <Icon className="size-4" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">
              <CardTitle level={3} className="text-base">
                {title}
              </CardTitle>
              {description ? (
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TextAction({
  href,
  children,
  className,
}: {
  href: Route;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-signal underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function statusLabel(status: RequirementStatus): string {
  return requirementStatusDisplay(status).label.toLowerCase();
}

function requirementStatus(value: unknown): RequirementStatus | null {
  if (typeof value !== "string") return null;
  return REQUIREMENT_STATUSES.find((status) => status === value) ?? null;
}

/**
 * Regression evidence stores the attribution as
 * `"216 file(s) changed: a.tsx, b.tsx, …"`. The dashboard shows the count and
 * leaves the file list in the evidence log — printing 200 paths made the
 * banner unreadable while adding nothing a reader could act on.
 */
function changedFilesLabel(changeContext: unknown): string | null {
  if (typeof changeContext !== "string") return null;
  const match = /^(\d+)\s+file(?:s|\(s\))?\s+changed/i.exec(changeContext);
  if (!match) return null;
  const count = Number(match[1]);
  return `${count} file${count === 1 ? "" : "s"} changed`;
}

/** Regressions worth a decision: one compact row each, not a paragraph. */
export function DashboardRegressionsBanner({
  regressions,
  controlById,
}: {
  regressions: EvidenceRecord[];
  /** Same control resolver the findings queue uses (catalog display). */
  controlById: (controlId: string) => Control;
}) {
  if (regressions.length === 0) return null;
  return (
    <section
      className="surface-panel rounded-xl border-destructive/25 bg-destructive/5 px-4 py-3 sm:px-5"
      aria-labelledby="recent-regressions-heading"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive">
          <Layers className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2
              id="recent-regressions-heading"
              className="text-sm font-semibold text-foreground"
            >
              {regressions.length} regression
              {regressions.length === 1 ? "" : "s"} since the last assessment
            </h2>
            <TextAction href="/evidence" className="hidden sm:inline-flex">
              Evidence
            </TextAction>
          </div>
          <ul className="mt-1">
            {regressions.map((record) => {
              const from = requirementStatus(record.detail?.from);
              const to = requirementStatus(record.detail?.to);
              const control = record.controlId
                ? controlById(record.controlId)
                : null;
              const files = changedFilesLabel(record.detail?.changeContext);
              return (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-destructive/15 py-1.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm text-foreground">
                    {control ? (
                      <>
                        <span className="font-mono text-xs text-muted-foreground">
                          {control.code}
                        </span>
                        <span className="font-medium">{control.title}</span>
                      </>
                    ) : (
                      <span className="line-clamp-2">{record.summary}</span>
                    )}
                  </span>
                  {from && to ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[0.7rem] font-medium text-destructive">
                      <span className="sr-only">
                        Regressed from {statusLabel(from)} to {statusLabel(to)}:
                      </span>
                      <span aria-hidden>{statusLabel(from)}</span>
                      <ArrowRight className="size-3" aria-hidden />
                      <span aria-hidden>{statusLabel(to)}</span>
                    </span>
                  ) : null}
                  <span className="ml-auto flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {files ? <span>{files}</span> : null}
                    {files ? <span aria-hidden>·</span> : null}
                    <FormattedDateTime iso={record.at} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Primary work queue: open findings in severity order. */
export function DashboardFindingsQueue({
  openFindings,
  openCount,
  controlById,
}: {
  openFindings: Finding[];
  /** Exact open total (loaded rows are capped — never derive counts from them). */
  openCount: number;
  controlById: (controlId: string) => Control;
}) {
  const allClear = openCount === 0;

  return (
    <ActivityCard
      title={allClear ? "All clear" : "Needs attention"}
      description={
        allClear
          ? "No open findings — recent verifications and activity below."
          : `${openCount} open finding${openCount === 1 ? "" : "s"} · ordered by severity`
      }
      icon={FileSearch}
      action={
        allClear ? null : (
          <TextAction href="/findings?tab=open">All findings</TextAction>
        )
      }
    >
      {openCount === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Everything detected has been fixed, verified, or reviewed. Keep
            monitoring for regressions after the next assessment.
          </p>
          <div className="flex flex-wrap gap-2">
            <TextAction href="/evidence">Evidence trail</TextAction>
            <TextAction href="/requirements">Requirements</TextAction>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {openFindings.slice(0, 6).map((finding) => {
            const control = controlById(finding.controlId);
            return (
              <li key={finding.id}>
                <Link
                  href={`/findings/${finding.id}`}
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SeverityBadge severity={finding.severity} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium group-hover:text-signal">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                        {control.code}
                      </span>
                      {control.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs break-all text-muted-foreground">
                      {formatLocationRef(finding.location)}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-60"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ActivityCard>
  );
}

/** Files touched since the previous scan — the context behind a regression. */
export function DashboardChangesCard({
  recentChanges,
}: {
  recentChanges: FileChange[];
}) {
  if (recentChanges.length === 0) return null;
  const shown = recentChanges.slice(0, 5);
  const hidden = recentChanges.length - shown.length;

  return (
    <ActivityCard
      title="Changes since last assessment"
      description={`${recentChanges.length} file${recentChanges.length === 1 ? "" : "s"} changed`}
      icon={GitCommitHorizontal}
    >
      <ul className="flex flex-wrap gap-1">
        {shown.map((change) => (
          <li
            key={change.filePath}
            className="max-w-full truncate rounded-md bg-muted/30 px-2 py-1 font-mono text-xs text-muted-foreground"
            title={change.filePath}
          >
            {change.filePath}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          +{hidden} more file{hidden === 1 ? "" : "s"}
        </p>
      ) : null}
    </ActivityCard>
  );
}

/**
 * Job lifecycle evidence repeats what the assessment record already says
 * ("Assessment job completed" followed by "Assessment completed" for the same
 * run). The pipeline card owns live job state; the feed keeps the result.
 */
function isJobLifecycleNoise(record: EvidenceRecord): boolean {
  if (record.kind !== "assessment_job") return false;
  const phase = record.detail?.phase;
  return phase === "queued" || phase === "started" || phase === "completed";
}

/** Verification + evidence timeline: the project's history, newest first. */
export function DashboardActivityFeed({
  recentVerified,
  recentEvidence,
}: {
  recentVerified: EvidenceRecord[];
  recentEvidence: EvidenceRecord[];
}) {
  const verifiedIds = new Set(recentVerified.map((record) => record.id));
  const mergedActivity = (() => {
    const seen = new Set<string>();
    const combined = [...recentEvidence, ...recentVerified].filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return !isJobLifecycleNoise(record);
    });
    combined.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return combined.slice(0, 4);
  })();

  return (
    <ActivityCard
      title="Recent activity"
      description="Verifications and evidence, newest first."
      icon={History}
      action={<TextAction href="/evidence">Evidence</TextAction>}
    >
      {mergedActivity.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evidence yet.</p>
      ) : (
        <ol className="flex flex-col">
          {mergedActivity.map((record) => {
            const isVerified = verifiedIds.has(record.id);
            const display = evidenceDisplay(record.kind, record.detail);
            return (
              <li
                key={record.id}
                className="flex gap-3 border-t border-border/50 py-2.5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    EVIDENCE_TONE_DOT[display.tone],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {display.label}
                    </span>
                    {isVerified ? (
                      <Badge
                        variant="secondary"
                        className="border-status-passed/30 text-status-passed"
                      >
                        Verified
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {record.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <FormattedDateTime iso={record.at} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </ActivityCard>
  );
}
