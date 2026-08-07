import Link from "next/link";
import { SeverityBadge } from "@/components/badges";
import { formatDateTime } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  Control,
  EvidenceRecord,
  FileChange,
  Finding,
  FindingCluster,
} from "@/core/types";

export function DashboardActivitySections({
  regressions,
  recentChanges,
  clusters,
  openFindings,
  recentEvidence,
  controlById,
}: {
  regressions: EvidenceRecord[];
  recentChanges: FileChange[];
  clusters: FindingCluster[];
  openFindings: Finding[];
  recentEvidence: EvidenceRecord[];
  controlById: (controlId: string) => Control;
}) {
  return (
    <div className="flex flex-col gap-6">
      {regressions.length > 0 ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Recent compliance regressions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {regressions.map((record) => (
                <li key={record.id} className="text-sm text-destructive">
                  {record.summary}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>
            Open findings prioritized for remediation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open findings. Everything detected has been fixed, verified, or
              reviewed.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {openFindings.slice(0, 6).map((finding) => {
                const control = controlById(finding.controlId);
                return (
                  <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/findings/${finding.id}`}
                      className="group flex flex-wrap items-center gap-3"
                    >
                      <SeverityBadge severity={finding.severity} />
                      <span className="text-sm font-medium group-hover:underline">
                        {control.code} — {control.title}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {finding.location.filePath}:{finding.location.line}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {(recentChanges.length > 0 || clusters.length > 0) && (
        <>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            {recentChanges.length > 0 ? (
              <Card className="bg-card/60 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">
                    Changes since previous assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {recentChanges.slice(0, 8).map((change) => (
                      <li
                        key={change.filePath}
                        className="font-mono text-sm text-muted-foreground"
                      >
                        {change.filePath}
                        {change.author ? (
                          <span className="ml-2 font-sans text-xs">
                            {change.author}
                            {change.commitSubject
                              ? ` — ${change.commitSubject}`
                              : ""}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {clusters.length > 0 ? (
              <Card className="bg-card/60 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">
                    Likely shared root causes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {clusters.map((cluster) => (
                      <li key={cluster.id} className="text-sm">
                        <Link
                          href="/findings"
                          className="hover:underline"
                        >
                          {cluster.label}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {cluster.findingIds.length} findings
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}

      <Card className="bg-card/60 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentEvidence.map((record) => (
                <li key={record.id} className="text-sm text-muted-foreground">
                  {record.summary}
                  <span className="ml-2 text-xs">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
