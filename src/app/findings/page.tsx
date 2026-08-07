import Link from "next/link";
import {
  EngineBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { PaginationNav } from "@/components/pagination-nav";
import { EmptyState, PageHeader } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLocationRef } from "@/core/location";
import { severityRank } from "@/core/labels";
import {
  DEFAULT_PAGE_SIZE,
  paginateSlice,
  parsePageParam,
} from "@/core/pagination";
import {
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/prioritization";
import type { Finding, FindingStatus } from "@/core/types";
import { findingsForProject } from "@/server/project-visibility";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
} from "@/server/workspace";

export const dynamic = "force-dynamic";

function FindingRows({
  findings,
  db,
  maxCount,
}: {
  findings: Finding[];
  db: Parameters<typeof controlById>[0];
  maxCount?: number;
}) {
  const slice = maxCount ? findings.slice(0, maxCount) : findings;
  return (
    <>
      <ul className="divide-y divide-border">
        {slice.map((finding) => {
          const control = controlById(db, finding.controlId);
          const remediation = remediationForFinding(db, finding.id);
          return (
            <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/findings/${finding.id}`}
                className="group flex flex-col gap-1"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <RemediationStatusBadge status={remediation.status} />
                  <EngineBadge engine={finding.engine ?? "ast"} />
                  <span className="text-sm font-medium group-hover:underline">
                    {control.code} — {control.title}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {finding.reason}
                </span>
                <span className="font-mono text-xs text-muted-foreground/60">
                  {formatLocationRef(finding.location)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {maxCount && findings.length > maxCount ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing first {maxCount} of {findings.length}.
        </p>
      ) : null}
    </>
  );
}

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const page = parsePageParam(pageRaw);
  const { db, project } = await getWorkspace();
  if (!project) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="Every failure with its reason, location, remediation state, and evidence."
        />
        <EmptyState title="No project connected">
          <p>Connect a repository from the dashboard to see findings.</p>
        </EmptyState>
      </>
    );
  }
  const findings = findingsForProject(db.findings, project.id);

  const byStatus = (status: FindingStatus): Finding[] => {
    const filtered = findings.filter((f) => f.status === status);
    if (status === "open") return prioritizeFindings(filtered, db.controls);
    return filtered.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );
  };

  const clusters = prioritizeClusters(findings, db.controls).slice(0, 10);
  const openSlice = paginateSlice(byStatus("open"), page);
  const resolved = byStatus("resolved");
  const dismissed = byStatus("dismissed");

  const defaultTab =
    openSlice.total > 0
      ? "open"
      : resolved.length > 0
        ? "resolved"
        : "dismissed";

  if (findings.length === 0) {
    return (
      <>
        <PageHeader
          title="Findings"
          description="Every failure with its reason, location, remediation state, and evidence."
        />
        <EmptyState title="No findings yet">
          <p>Run an assessment from the dashboard to detect compliance gaps.</p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every failure with its reason, location, remediation state, and evidence."
      />

      <div className="flex flex-col gap-6">
        {clusters.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Shared root causes ({clusters.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {clusters.map((cluster) => (
                  <li key={cluster.id}>
                    <p className="text-sm font-medium">{cluster.label}</p>
                    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {cluster.findingIds
                        .slice(0, DEFAULT_PAGE_SIZE)
                        .map((findingId) => {
                          const finding = findings.find(
                            (c) => c.id === findingId,
                          );
                          if (!finding) return null;
                          return (
                            <li key={findingId}>
                              <Link
                                href={`/findings/${findingId}`}
                                className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                              >
                                {formatLocationRef(finding.location)}
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="open">
              Open{openSlice.total > 0 ? ` (${openSlice.total})` : ""}
            </TabsTrigger>
            <TabsTrigger value="resolved">
              Resolved{resolved.length > 0 ? ` (${resolved.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="dismissed">
              Dismissed{dismissed.length > 0 ? ` (${dismissed.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4">
            {openSlice.total === 0 ? (
              <p className="text-sm text-muted-foreground">No open findings.</p>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <FindingRows findings={openSlice.items} db={db} />
                  <PaginationNav
                    page={openSlice.page}
                    totalPages={openSlice.totalPages}
                    total={openSlice.total}
                    basePath="/findings"
                    label="Open findings pagination"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="resolved" className="mt-4">
            {resolved.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No resolved findings.
              </p>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <FindingRows
                    findings={resolved}
                    db={db}
                    maxCount={DEFAULT_PAGE_SIZE}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dismissed" className="mt-4">
            {dismissed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dismissed findings.
              </p>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <FindingRows
                    findings={dismissed}
                    db={db}
                    maxCount={DEFAULT_PAGE_SIZE}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
