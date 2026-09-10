import Link from "next/link";
import { SeverityBadge } from "@/components/badges";
import { EmptyState } from "@/components/page-primitives";
import { findingsListHref } from "@/core/filters";
import type { Finding, FindingCluster } from "@complyloop/db/types";
import { severityRank } from "@/core/lifecycle";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";

function severityMix(
  members: Finding[],
): { severity: Severity; count: number }[] {
  const counts = new Map<Severity, number>();
  for (const finding of members) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function FindingsClustersTab({
  clusters,
  findings,
}: {
  clusters: FindingCluster[];
  findings: ReadonlyArray<Finding>;
}) {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));

  if (clusters.length === 0) {
    return (
      <EmptyState title="No shared root causes">
        Clusters appear when two or more open findings share a check and location
        signal.
      </EmptyState>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Shared root causes">
      {clusters.map((cluster) => {
        const members = cluster.findingIds
          .map((id) => byId.get(id))
          .filter((finding): finding is Finding => finding !== undefined);
        const mix = severityMix(members);

        return (
          <li key={cluster.id}>
            <Link
              href={findingsListHref({ tab: "open", cluster: cluster.id })}
              className="block rounded-xl border border-border/70 bg-card/80 p-4 shadow-none outline-none transition-[background-color,border-color,box-shadow] hover:border-signal/40 hover:bg-accent/30 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-medium">{cluster.label}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {cluster.sharedLocation}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {cluster.findingIds.length} findings
                </span>
                {mix.map(({ severity, count }) => (
                  <span key={severity} className="inline-flex items-center gap-1">
                    <SeverityBadge severity={severity} />
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
