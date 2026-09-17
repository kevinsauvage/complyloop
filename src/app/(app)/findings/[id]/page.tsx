import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { engineFor } from "@complyloop/analysis-core/contract/finding-types";

import {
  BadgeWithDescription,
  FindingStatusBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { DeveloperHandoffCard } from "@/components/developer-handoff";
import { FindingNextStepPanel } from "@/components/findings/finding-next-step-panel";
import { FindingQueueNav } from "@/components/findings/finding-queue-nav";
import { FindingUnderstandCard } from "@/components/findings/finding-understand-card";
import { RemediationHistory } from "@/components/findings/remediation-history";
import { FormattedDateTime } from "@/components/formatted-datetime";
import {
  EmptyState,
  PageContent,
  PageHeader,
  PageSection,
} from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  confidenceDisplay,
  engineDisplay,
  evidenceDisplay,
} from "@/core/display";
import { findingsListHref } from "@/core/filter-params";
import { cn } from "@/lib/utils";
import { displayControl } from "@/server/reporting/report";
import { loadFindingDetailView } from "@/server/workspace/finding-detail-view";
import { isProjectVisible } from "@/server/workspace/project-visibility";
import { getWorkspace, requireFinding } from "@/server/workspace/workspace";

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const view = await loadFindingDetailView(id, await searchParams);
  if (!view.finding) notFound();

  const {
    finding,
    caps,
    remediation,
    control,
    evidence,
    prUrl,
    patchState,
    aiAvailable,
    act,
    handoff,
    queuePosition,
    listParams,
    suggestionStale,
  } = view;

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
          <span title={finding.checkId} className="max-w-64 truncate font-mono">
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
          suggestionStale={suggestionStale}
        />

        <RemediationHistory remediation={remediation} evidence={evidence} />

        {handoff ? (
          <PageSection id="copy-handoff" title="Copy patch / PR body">
            <DeveloperHandoffCard handoff={handoff} prUrl={prUrl} />
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
            <div className="surface-panel rounded-xl p-4">
              <p className="mb-3 text-xs text-muted-foreground">Newest first</p>
              <ol className="relative flex flex-col gap-0 border-l border-border/70 pl-4">
                {evidence.slice(0, 5).map((record, index) => (
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
                      <FormattedDateTime
                        iso={record.at}
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {record.summary}
                    </p>
                  </li>
                ))}
              </ol>
              {evidence.length > 5 ? (
                <details className="mt-3 border-t border-border/60 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Show all {evidence.length} ({evidence.length} total)
                  </summary>
                  <ol className="relative mt-3 flex flex-col gap-0 border-l border-border/70 pl-4">
                    {evidence.slice(5).map((record) => (
                      <li key={record.id} className="relative pb-4 last:pb-0">
                        <span
                          className="absolute top-1.5 -left-[1.28125rem] size-2.5 rounded-full bg-muted-foreground/40 ring-4 ring-background"
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Badge variant="secondary">
                            {evidenceDisplay(record.kind, record.detail).label}
                          </Badge>
                          <FormattedDateTime
                            iso={record.at}
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {record.summary}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          )}
        </PageSection>
      </PageContent>
    </>
  );
}

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
