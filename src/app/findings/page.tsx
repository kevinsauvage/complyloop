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
import type { FindingStatus } from "@/core/statuses";
import type { Finding } from "@/core/finding-types";
import { findingsForProject } from "@/server/project-visibility";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
} from "@/server/workspace";

export const dynamic = "force-dynamic";

type FindingsTab = "open" | "resolved" | "dismissed";

function parseTab(raw: string | undefined): FindingsTab | undefined {
  if (raw === "open" || raw === "resolved" || raw === "dismissed") return raw;
  return undefined;
}

function FindingRows({
  findings,
  db,
}: {
  findings: Finding[];
  db: Parameters<typeof controlById>[0];
}) {
  return (
    <ul className="divide-y divide-border">
      {findings.map((finding) => {
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
              <span className="font-mono text-xs text-muted-foreground">
                {formatLocationRef(finding.location)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function tabHref(tab: FindingsTab): string {
  return tab === "open" ? "/findings" : `/findings?tab=${tab}`;
}

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { page: pageRaw, tab: tabRaw } = await searchParams;
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
  const resolvedSlice = paginateSlice(byStatus("resolved"), page);
  const dismissedSlice = paginateSlice(byStatus("dismissed"), page);

  const defaultTab: FindingsTab =
    parseTab(tabRaw) ??
    (openSlice.total > 0
      ? "open"
      : resolvedSlice.total > 0
        ? "resolved"
        : "dismissed");

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

        <Tabs key={defaultTab} defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="open" asChild>
              <Link href={tabHref("open")}>
                Open{openSlice.total > 0 ? ` (${openSlice.total})` : ""}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="resolved" asChild>
              <Link href={tabHref("resolved")}>
                Resolved
                {resolvedSlice.total > 0 ? ` (${resolvedSlice.total})` : ""}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="dismissed" asChild>
              <Link href={tabHref("dismissed")}>
                Dismissed
                {dismissedSlice.total > 0 ? ` (${dismissedSlice.total})` : ""}
              </Link>
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
            {resolvedSlice.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No resolved findings.
              </p>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <FindingRows findings={resolvedSlice.items} db={db} />
                  <PaginationNav
                    page={resolvedSlice.page}
                    totalPages={resolvedSlice.totalPages}
                    total={resolvedSlice.total}
                    basePath="/findings"
                    query={{ tab: "resolved" }}
                    label="Resolved findings pagination"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dismissed" className="mt-4">
            {dismissedSlice.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dismissed findings.
              </p>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <FindingRows findings={dismissedSlice.items} db={db} />
                  <PaginationNav
                    page={dismissedSlice.page}
                    totalPages={dismissedSlice.totalPages}
                    total={dismissedSlice.total}
                    basePath="/findings"
                    query={{ tab: "dismissed" }}
                    label="Dismissed findings pagination"
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
