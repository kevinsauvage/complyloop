import {
  ArrowUpRight,
  FileSearch,
  GitCommitHorizontal,
  History,
  Layers,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import type {
  EvidenceRecord,
  FileChange,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { SeverityBadge } from "@/components/primitives/badges";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { PageActionLink } from "@/components/primitives/page-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVIDENCE_TONE_DOT, evidenceDisplay } from "@/core/display";
import { cn } from "@/lib/utils";

function ActivityCard({
  title,
  description,
  children,
  className,
  icon: Icon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className={cn("h-full border-border/70 shadow-none", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
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
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DashboardRegressionsBanner({
  regressions,
}: {
  regressions: EvidenceRecord[];
}) {
  if (regressions.length === 0) return null;
  return (
    <section
      className="surface-panel rounded-xl border-destructive/30 bg-destructive/5 p-4 sm:p-5"
      aria-labelledby="recent-regressions-heading"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <Layers className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3
            id="recent-regressions-heading"
            className="text-base font-medium text-foreground"
          >
            Recent compliance regressions
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Requirement statuses that worsened since the last assessment.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {regressions.map((record) => (
          <li
            key={record.id}
            className="rounded-lg border border-destructive/25 bg-background/70 px-3 py-2 text-sm text-destructive"
          >
            {record.summary}
            <span className="ml-2 text-xs text-muted-foreground">
              <FormattedDateTime iso={record.at} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Left-rail work queue: open findings in severity order. Full column width. */
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
          : "Open findings ordered by severity for remediation."
      }
      icon={FileSearch}
    >
      {openCount === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Everything detected has been fixed, verified, or reviewed. Keep
            monitoring for regressions after the next assessment.
          </p>
          <div className="flex flex-wrap gap-2">
            <PageActionLink href="/evidence">
              View evidence trail
            </PageActionLink>
            <PageActionLink href="/requirements">
              View requirements
            </PageActionLink>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1">
            {openFindings.slice(0, 6).map((finding) => {
              const control = controlById(finding.controlId);
              return (
                <li key={finding.id}>
                  <Link
                    href={`/findings/${finding.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 outline-none transition-[background-color,border-color] duration-200 hover:border-border/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SeverityBadge severity={finding.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium group-hover:text-signal">
                        {control.code} — {control.title}
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
          {openCount > 6 ? (
            <Link
              href="/findings?tab=open"
              className="text-sm font-medium text-signal underline-offset-4 hover:underline"
            >
              View all {openCount} open findings
            </Link>
          ) : null}
        </div>
      )}
    </ActivityCard>
  );
}

/** Right-rail ops stack: changed files + verification/evidence timeline. */
export function DashboardOpsTimeline({
  recentChanges,
  recentVerified,
  recentEvidence,
}: {
  recentChanges: FileChange[];
  recentVerified: EvidenceRecord[];
  recentEvidence: EvidenceRecord[];
}) {
  const verifiedIds = new Set(recentVerified.map((record) => record.id));
  const mergedActivity = (() => {
    const seen = new Set<string>();
    const combined = [...recentEvidence, ...recentVerified].filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
    combined.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return combined.slice(0, 6);
  })();

  return (
    <div className="flex flex-col gap-4">
      {recentChanges.length > 0 ? (
        <ActivityCard
          title="Changes since last assessment"
          description={`${recentChanges.length} file${recentChanges.length === 1 ? "" : "s"} changed`}
          icon={GitCommitHorizontal}
        >
          <ul className="flex flex-col gap-1.5">
            {recentChanges.slice(0, 6).map((change) => (
              <li
                key={change.filePath}
                className="rounded-md bg-muted/30 px-2.5 py-1.5 font-mono text-xs break-all text-muted-foreground"
              >
                {change.filePath}
              </li>
            ))}
          </ul>
        </ActivityCard>
      ) : null}

      <ActivityCard title="Recent activity" icon={History}>
        {mergedActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence yet.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border/60 pl-5">
            {mergedActivity.map((record) => {
              const isVerified = verifiedIds.has(record.id);
              const display = evidenceDisplay(record.kind, record.detail);
              return (
                <li key={record.id} className="relative min-w-0">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-5 size-2 -translate-x-1/2 rounded-full ring-4 ring-card",
                      EVIDENCE_TONE_DOT[display.tone],
                    )}
                    aria-hidden
                  />
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
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {record.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <FormattedDateTime iso={record.at} />
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </ActivityCard>
    </div>
  );
}
