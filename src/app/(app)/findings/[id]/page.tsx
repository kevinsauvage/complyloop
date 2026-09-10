import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { aiExplanationAvailable } from "@/ai/explainer";
import {
  FindingStatusBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { BadgeWithDescription } from "@/components/badge-with-description";
import { CopyButton } from "@/components/copy-button";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { FindingNextStepPanel } from "@/components/findings/finding-next-step-panel";
import { FindingQueueNav } from "@/components/findings/finding-queue-nav";
import { FindingUnderstandCard } from "@/components/findings/finding-understand-card";
import { RemediationHistory } from "@/components/findings/remediation-history";
import { findingAct } from "@/core/finding-act";
import { confidenceDisplay, engineDisplay, evidenceDisplay } from "@/core/status-display";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import {
  findingQueuePosition,
  findingsListHref,
  orderedFindingIdsForQueue,
  parseFindingListParams,
  type FilterFindingsContext,
} from "@/core/finding-list-filter";
import { EmptyState, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import { formatDateTime } from "@/core/format-datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pullRequestUrlFromEvidence, latestPatchState } from "@/server/ai-fix";
import { buildDeveloperHandoff } from "@/server/handoff";
import { getDrizzle } from "@complyloop/db/client";
import { listEvidenceForFinding } from "@complyloop/db/repo/evidence";
import { projectCapabilities } from "@/server/project-capabilities";
import { findingsInScope } from "@/server/project-scope";
import {
  getWorkspace,
  requireFinding,
  requireRemediationForFinding,
} from "@/server/workspace";
import { getProjectRuntime } from "@/server/project-runtime";
import { displayControl } from "@/server/report";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import { prioritizeClusters } from "@/core/prioritization";
import { clusterFindings } from "@/core/root-cause";
import { cn } from "@/lib/utils";
import { isProjectVisible } from "@/server/project-visibility";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Finding",
    description: "Finding detail with remediation state and evidence trail.",
  };
  try {
    const { id } = await params;
    const finding = await requireFinding(id);
    const { projects, access } = await getWorkspace();
    const project = projects.find(
      (candidate) => candidate.id === finding.projectId,
    );
    if (!project || !isProjectVisible(project, access)) return fallback;
    const control = displayControl(finding.controlId, project);
    return {
      title: `${control.code} — ${control.title}`,
      description: `${control.secondaryCode} · ${control.description}`,
    };
  } catch {
    return fallback;
  }
}

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const listParams = parseFindingListParams(await searchParams);
  const { access, projects } = await getWorkspace();
  let finding;
  try {
    finding = await requireFinding(id);
  } catch {
    notFound();
  }
  const project = projects.find((candidate) => candidate.id === finding.projectId);
  if (!project || !isProjectVisible(project, access)) notFound();

  const [runtime, remediation] = await Promise.all([
    getProjectRuntime(project.id),
    requireRemediationForFinding(finding.id),
  ]);
  const remediationByFindingId = new Map(
    runtime.remediations.map((row) => [row.findingId, row]),
  );
  const caps = projectCapabilities(project, access, project.orgId);

  const control = displayControl(finding.controlId, project);
  const evidence = await listEvidenceForFinding(await getDrizzle(), finding.id);
  const chronologicalEvidence = [...evidence].reverse();
  const aiAvailable = aiExplanationAvailable();
  const prUrl = pullRequestUrlFromEvidence(chronologicalEvidence);
  const patchState = latestPatchState(chronologicalEvidence);
  const githubConnected = Boolean(project.github?.fullName);
  const act = findingAct({
    finding,
    remediation,
    canRemediate: caps.canRemediate,
    prUrl,
    aiAvailable,
    patchReady: patchState.status === "ready",
    githubConnected,
  });
  const handoff = act.showHandoff
    ? buildDeveloperHandoff(project, control, finding, remediation)
    : null;

  const scopedFindings = findingsInScope(runtime.findings, project);
  const controls = shippedCatalog().controls;
  const rawClusters = clusterFindings(scopedFindings, controls);
  const clusters = prioritizeClusters(scopedFindings, controls, rawClusters);
  const queueFilterContext: FilterFindingsContext = {
    controls,
    remediationStatusFor: (findingId) =>
      remediationByFindingId.get(findingId)?.status,
    clusterFindingIds: listParams.cluster
      ? new Set(
          clusters.find((cluster) => cluster.id === listParams.cluster)
            ?.findingIds ?? [],
        )
      : undefined,
    clusters: rawClusters,
  };

  const queueIds = orderedFindingIdsForQueue(
    scopedFindings,
    listParams,
    queueFilterContext,
  );
  const queuePosition = findingQueuePosition(queueIds, finding.id);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2.5 w-fit" asChild>
          <Link href={findingsListHref(listParams)}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to findings
          </Link>
        </Button>
        <div className="surface-panel rounded-xl px-3 py-2.5">
          <FindingQueueNav
            listParams={listParams}
            prevId={queuePosition.prevId}
            nextId={queuePosition.nextId}
            index={queuePosition.index}
            total={queuePosition.total}
          />
        </div>
      </div>
      <PageHeader
        title={`${control.code} — ${control.title}`}
        description={`${control.secondaryCode} · ${control.description}`}
      >
        <div
          role="group"
          aria-label={`Finding status: ${finding.status}, remediation: ${remediation.status}`}
          className="flex max-w-full flex-wrap items-center justify-end gap-2"
        >
          <FindingStatusBadge status={finding.status} />
          <SeverityBadge severity={finding.severity} />
          <RemediationStatusBadge status={remediation.status} />
        </div>
        <p className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:justify-end">
          <BadgeWithDescription
            description={engineDisplay(engineFor(finding)).description}
          >
            <span>{engineDisplay(engineFor(finding)).label}</span>
          </BadgeWithDescription>
          <span aria-hidden>·</span>
          <BadgeWithDescription
            description={confidenceDisplay(finding.confidence).description}
          >
            <span>Confidence: {finding.confidence}</span>
          </BadgeWithDescription>
          <span aria-hidden>·</span>
          <span
            title={finding.checkId}
            className="max-w-64 truncate font-mono"
          >
            {finding.checkId}
          </span>
          <CopyButton label="Copy check ID" text={finding.checkId} />
        </p>
      </PageHeader>

      <PageContent>
        <FindingUnderstandCard
          finding={finding}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
        />

        <FindingNextStepPanel
          act={act}
          finding={finding}
          remediation={remediation}
          canRemediate={caps.canRemediate}
          patchState={patchState}
        />

        <RemediationHistory remediation={remediation} />

        {handoff ? (
          <PageSection id="copy-handoff" title="Copy patch / PR body">
            <DeveloperHandoffCard handoff={handoff} />
          </PageSection>
        ) : null}

        <PageSection title={`Evidence trail (${evidence.length})`}>
          {evidence.length === 0 ? (
            <EmptyState title="No evidence yet">
              <p>
                Evidence appears after assessments and actions. This finding has
                not yet generated an evidence record.
              </p>
            </EmptyState>
          ) : (
            <div className="surface-panel rounded-2xl p-4">
              <p className="mb-3 text-xs text-muted-foreground">Newest first</p>
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
                      <Badge variant="secondary">
                        {evidenceDisplay(record.kind, record.detail).label}
                      </Badge>
                      {index === 0 ? (
                        <span className="rounded-full border border-signal/40 px-1.5 py-px text-xs font-semibold text-signal">
                          Latest
                        </span>
                      ) : null}
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
            </div>
          )}
        </PageSection>
      </PageContent>
    </>
  );
}
