import {
  ArrowUpRight,
  FileSearch,
  GitCommitHorizontal,
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
import { evidenceDisplay } from "@/core/display";
import type { FindingCluster } from "@/core/findings/finding-priority";
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

export function DashboardActivitySections({
  regressions,
  recentChanges,
  clusters,
  openFindings,
  recentVerified,
  recentEvidence,
  controlById,
  hideRegressions = false,
}: {
  regressions: EvidenceRecord[];
  recentChanges: FileChange[];
  clusters: FindingCluster[];
  openFindings: Finding[];
  recentVerified: EvidenceRecord[];
  recentEvidence: EvidenceRecord[];
  controlById: (controlId: string) => Control;
  /** When the unread-alerts card is shown it already covers regressions. */
  hideRegressions?: boolean;
}) {
  const allClear = openFindings.length === 0;
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
    <div className="grid gap-4 lg:grid-cols-12">
      {!hideRegressions && regressions.length > 0 ? (
        <section
          className="surface-panel rounded-xl border-destructive/30 bg-destructive/5 p-4 sm:p-5 lg:col-span-12"
          aria-labelledby="recent-regressions-heading"
        >
          <div className="mb-4 flex items-start gap-3">
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
      ) : allClear ? (
        <ActivityCard
          title="No regressions detected"
          description="Requirement statuses have not regressed since your last assessments."
          className="border-status-passed/30 bg-status-passed/5 lg:col-span-12"
          icon={Layers}
        >
          <p className="text-sm text-muted-foreground">
            Keep running assessments after code changes to catch regressions
            early.
          </p>
        </ActivityCard>
      ) : null}

      <ActivityCard
        title={allClear ? "All clear" : "Needs attention"}
        description={
          allClear
            ? "No open findings — recent verifications and activity below."
            : "Open findings prioritized for remediation."
        }
        className="lg:col-span-7"
        icon={FileSearch}
      >
        {openFindings.length === 0 ? (
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
                      className="group flex flex-wrap items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 outline-none transition-[background-color,border-color] duration-200 hover:border-border/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <SeverityBadge severity={finding.severity} />
                      <span className="min-w-0 flex-1 text-sm font-medium group-hover:text-signal">
                        {control.code} — {control.title}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground w-full">
                        {formatLocationRef(finding.location)}
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
            {openFindings.length > 6 ? (
              <Link
                href="/findings?tab=open"
                className="text-sm font-medium text-signal underline-offset-4 hover:underline"
              >
                View all {openFindings.length} open findings
              </Link>
            ) : null}
          </div>
        )}
      </ActivityCard>

      <div className="flex flex-col gap-4 lg:col-span-5">
        {recentChanges.length > 0 ? (
          <ActivityCard
            title="Changes since last assessment"
            icon={GitCommitHorizontal}
          >
            <ul className="flex flex-col gap-2">
              {recentChanges.slice(0, 6).map((change) => (
                <li
                  key={change.filePath}
                  className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2 font-mono text-xs text-muted-foreground"
                >
                  {change.filePath}
                </li>
              ))}
            </ul>
          </ActivityCard>
        ) : null}

        {clusters.length > 0 ? (
          <ActivityCard
            title="Likely shared root causes"
            icon={Layers}
            className="scroll-mt-4"
          >
            <div id="root-causes" className="scroll-mt-4" aria-hidden />
            <ul className="flex flex-col gap-2">
              {clusters.map((cluster) => (
                <li
                  key={cluster.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm"
                >
                  <Link
                    href="/findings?tab=by_cause"
                    className="font-medium hover:text-signal hover:underline"
                  >
                    {cluster.label}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {cluster.findingIds.length} findings
                  </span>
                </li>
              ))}
            </ul>
          </ActivityCard>
        ) : null}
      </div>

      <ActivityCard
        title="Recent activity"
        className="lg:col-span-12"
        icon={Layers}
      >
        {mergedActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mergedActivity.map((record) => {
              const isVerified = verifiedIds.has(record.id);
              return (
                <li
                  key={record.id}
                  className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm text-muted-foreground"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {evidenceDisplay(record.kind, record.detail).label}
                    </span>
                    {isVerified ? (
                      <Badge
                        variant="secondary"
                        className="border-status-passed/30 text-status-passed"
                      >
                        Verified
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block">{record.summary}</span>
                  <span className="mt-1 block text-xs">
                    <FormattedDateTime iso={record.at} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </ActivityCard>
    </div>
  );
}
