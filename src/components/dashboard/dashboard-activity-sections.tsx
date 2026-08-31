import Link from "next/link";
import { SeverityBadge } from "@/components/badges";
import { formatDateTime, PageActionLink } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatLocationRef } from "@/core/location";
import { evidenceKindLabel } from "@/core/labels";
import type { Control } from "@/core/project-types";
import type { EvidenceRecord, FileChange, Finding, FindingCluster } from "@/core/finding-types";

export function DashboardActivitySections({
  regressions,
  recentChanges,
  clusters,
  openFindings,
  recentVerified,
  recentEvidence,
  controlById,
}: {
  regressions: EvidenceRecord[];
  recentChanges: FileChange[];
  clusters: FindingCluster[];
  openFindings: Finding[];
  recentVerified: EvidenceRecord[];
  recentEvidence: EvidenceRecord[];
  controlById: (controlId: string) => Control;
}) {
  const allClear = openFindings.length === 0;

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
      ) : allClear ? (
        <Card className="border-status-passed/30 bg-status-passed/5">
          <CardHeader>
            <CardTitle>No regressions detected</CardTitle>
            <CardDescription>
              Requirement statuses have not regressed since your last assessments.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{allClear ? "All clear" : "Needs attention"}</CardTitle>
          <CardDescription>
            {allClear
              ? "No open findings — recent verifications and activity below."
              : "Open findings prioritized for remediation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openFindings.length === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Everything detected has been fixed, verified, or reviewed. Keep
                monitoring for regressions after the next assessment.
              </p>
              {recentVerified.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Recently verified</h3>
                  <ul className="flex flex-col gap-2">
                    {recentVerified.map((record) => (
                      <li
                        key={record.id}
                        className="text-sm text-muted-foreground"
                      >
                        <span className="text-foreground">
                          {evidenceKindLabel(record.kind)}
                        </span>
                        {" — "}
                        {record.summary}
                        <span className="ml-2 text-xs">
                          {formatDateTime(record.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <PageActionLink href="/evidence">View evidence trail</PageActionLink>
                <PageActionLink href="/requirements">View requirements</PageActionLink>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {openFindings.slice(0, 6).map((finding) => {
                const control = controlById(finding.controlId);
                return (
                  <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/findings/${finding.id}`}
                      className="group flex flex-wrap items-center gap-3 rounded-lg outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring -mx-2 px-2 py-1"
                    >
                      <SeverityBadge severity={finding.severity} />
                      <span className="text-sm font-medium group-hover:underline">
                        {control.code} — {control.title}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatLocationRef(finding.location)}
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
