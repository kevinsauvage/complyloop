import Link from "next/link";
import { notFound } from "next/navigation";
import { aiExplanationAvailable } from "@/ai/explainer";
import {
  ConfidenceBadge,
  EngineBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { FindingDismissCard } from "@/components/findings/finding-dismiss-card";
import { FindingExplanationsCard } from "@/components/findings/finding-explanations-card";
import { FindingNextStepPanel } from "@/components/findings/finding-next-step-panel";
import { FindingQueueNav } from "@/components/findings/finding-queue-nav";
import { FindingRemediationCard } from "@/components/findings/finding-remediation-card";
import { formatLocationRef } from "@/core/location";
import { evidenceKindLabel } from "@/core/labels";
import {
  findingQueuePosition,
  orderedFindingIdsForQueue,
} from "@/core/finding-queue";
import {
  findingsListHref,
  parseFindingListParams,
  type FilterFindingsContext,
} from "@/core/finding-list-filter";
import { CodeBlock, PageHeader, formatDateTime } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pullRequestUrlFromEvidence } from "@/server/finding-pr-url";
import { buildDeveloperHandoff } from "@/server/handoff";
import { getDrizzle } from "@/server/db-store/client";
import { listEvidenceForFinding } from "@/server/db-store/postgres-queries";
import { projectCapabilities } from "@/server/project-capabilities";
import { resolveVisibleFinding } from "@/server/project-visibility";
import { findingsInScope } from "@/server/assessment-status";
import { controlById, getWorkspace, remediationForFinding } from "@/server/workspace";
import { prioritizeClusters } from "@/core/prioritization";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const listParams = parseFindingListParams(await searchParams);
  const { db, access } = await getWorkspace();
  const resolved = resolveVisibleFinding(
    id,
    db.findings,
    db.projects,
    access,
  );
  if (!resolved) notFound();
  const { finding, project } = resolved;
  const caps = projectCapabilities(project, access, project.orgId);

  const control = controlById(db, finding.controlId);
  const remediation = remediationForFinding(db, finding.id);
  const evidence = await listEvidenceForFinding(await getDrizzle(), finding.id);
  const aiAvailable = aiExplanationAvailable();
  const prUrl = pullRequestUrlFromEvidence(evidence);
  const handoff = buildDeveloperHandoff(project, control, finding, remediation);
  const showHandoff =
    remediation.suggestion !== null || finding.fix !== null;
  const canCreatePr =
    caps.canRemediate &&
    Boolean(finding.fix) &&
    Boolean(project.github?.fullName);

  const queueFilterContext: FilterFindingsContext = {
    controls: db.controls,
    remediationStatusFor: (findingId) =>
      remediationForFinding(db, findingId).status,
    clusterFindingIds: listParams.cluster
      ? new Set(
          prioritizeClusters(findingsInScope(db.findings, project), db.controls)
            .find((cluster) => cluster.id === listParams.cluster)
            ?.findingIds ?? [],
        )
      : undefined,
  };

  const queueIds = orderedFindingIdsForQueue(
    findingsInScope(db.findings, project),
    listParams,
    queueFilterContext,
  );
  const queuePosition = findingQueuePosition(queueIds, finding.id);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2.5 w-fit" asChild>
          <Link href={findingsListHref(listParams)}>← Back to findings</Link>
        </Button>
        <FindingQueueNav
          listParams={listParams}
          prevId={queuePosition.prevId}
          nextId={queuePosition.nextId}
          index={queuePosition.index}
          total={queuePosition.total}
        />
      </div>
      <PageHeader
        title={`${control.code} — ${control.title}`}
        description={`${control.secondaryCode} · ${control.description}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
        <SeverityBadge severity={finding.severity} />
        <ConfidenceBadge confidence={finding.confidence} />
        <RemediationStatusBadge status={remediation.status} />
        <EngineBadge engine={finding.engine ?? "ast"} />
        {finding.status === "dismissed" && finding.dismissal ? (
          <span className="text-sm text-muted-foreground">
            Dismissed ({finding.dismissal.reason.replace(/_/g, " ")}):{" "}
            {finding.dismissal.note || "no note"}
          </span>
        ) : null}
        {finding.status === "resolved" && finding.resolvedNote ? (
          <span className="text-sm text-status-passed">
            {finding.resolvedNote}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <FindingNextStepPanel
          finding={finding}
          remediation={remediation}
          canRemediate={caps.canRemediate}
          canCreatePr={canCreatePr}
          prUrl={prUrl}
        />

        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-signal" aria-hidden />
              Where
            </CardTitle>
            <CardDescription>
              Exact location in source or the rendered DOM — fix the call site,
              not a shared primitive unless every consumer is wrong.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
              {formatLocationRef(finding.location)}
            </p>
            {finding.location.kind === "dom" ? (
              <p className="text-sm text-muted-foreground">
                Runtime finding on the rendered page. Trace back to the
                form/call site that renders this control.
              </p>
            ) : null}
            <CodeBlock>{finding.location.snippet}</CodeBlock>
          </CardContent>
        </Card>

        <FindingExplanationsCard
          finding={finding}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        <FindingRemediationCard
          finding={finding}
          remediation={remediation}
          canRemediate={caps.canRemediate}
          canCreatePr={canCreatePr}
          aiAvailable={aiAvailable}
        />

        {showHandoff ? (
          <DeveloperHandoffCard
            handoff={handoff}
            findingId={finding.id}
            canCreatePr={false}
          />
        ) : null}

        {finding.status === "open" && caps.canRemediate ? (
          <div id="dismiss-finding">
            <FindingDismissCard findingId={finding.id} />
          </div>
        ) : null}

        <Card className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Evidence trail</CardTitle>
            <CardDescription>
              Append-only history for this finding — assessments never rewrite
              past records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evidence recorded yet.
              </p>
            ) : (
              <ol className="relative flex flex-col gap-0 border-l border-border/70 pl-4">
                {evidence.map((record, index) => (
                  <li key={record.id} className="relative pb-4 last:pb-0">
                    <span
                      className={cn(
                        "absolute top-1.5 -left-[1.28125rem] size-2.5 rounded-full ring-4 ring-background",
                        index === 0 ? "bg-signal" : "bg-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {evidenceKindLabel(record.kind)}
                      </Badge>
                      <time
                        dateTime={record.at}
                        className="text-xs text-muted-foreground"
                      >
                        {formatDateTime(record.at)}
                      </time>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {record.summary}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
