import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";

import { EvidenceTimeline } from "@/components/primitives/evidence-timeline";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import {
  EmptyState,
  PageContent,
  PageSection,
} from "@/components/primitives/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { evidenceDisplay } from "@/core/display/evidence";
import { findingsListHref } from "@/core/filter-params/findings";
import { effectiveBranch } from "@/server/github/tracked-branch";
import { findingHandoff } from "@/server/reporting/ai-handoff";
import { displayControl } from "@/server/reporting/report";
import { loadFindingDetailView } from "@/server/workspace/finding-detail-view";
import { isProjectVisible } from "@/server/workspace/project-visibility";
import { getWorkspace, requireFinding } from "@/server/workspace/workspace";

import { DeveloperHandoffCard } from "../_components/developer-handoff";
import { FindingHeader } from "../_components/finding-header";
import { FindingNextStepPanel } from "../_components/finding-next-step-panel";
import { FindingQueueNav } from "../_components/finding-queue-nav";
import { FindingUnderstandCard } from "../_components/finding-understand-card";
import { RemediationHistory } from "../_components/remediation-history";

function evidenceTimelineItem(record: EvidenceRecord, isLatest: boolean) {
  return {
    id: record.id,
    isLatest,
    badge: (
      <Badge variant="secondary">
        {evidenceDisplay(record.kind, record.detail).label}
      </Badge>
    ),
    date: (
      <FormattedDateTime
        iso={record.at}
        className="text-xs text-muted-foreground"
      />
    ),
    children: (
      <p className="mt-1.5 text-sm text-muted-foreground">{record.summary}</p>
    ),
  };
}

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
    project,
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
      {/* Navigation bar, not a panel: where you came from on the left, your
          place in the queue on the right. */}
      <nav
        aria-label="Finding navigation"
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
      >
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 w-fit shrink-0"
          asChild
        >
          <Link href={findingsListHref(listParams)}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to findings
          </Link>
        </Button>
        <div className="min-w-0 flex-1 sm:border-l sm:border-border/60 sm:pl-4">
          <FindingQueueNav
            listParams={listParams}
            prevId={queuePosition.prevId}
            nextId={queuePosition.nextId}
            index={queuePosition.index}
            total={queuePosition.total}
          />
        </div>
      </nav>

      <FindingHeader
        finding={finding}
        control={control}
        remediation={remediation}
        listParams={listParams}
        aiPrompt={findingHandoff(project, { control, finding })}
      />

      <PageContent>
        <FindingUnderstandCard
          finding={finding}
          canRemediate={caps.canRemediate}
          aiAvailable={aiAvailable}
          githubFullName={project.github?.fullName}
          defaultBranch={effectiveBranch(project.github) ?? "main"}
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
              <EvidenceTimeline
                label="Evidence trail"
                items={evidence
                  .slice(0, 5)
                  .map((record, index) =>
                    evidenceTimelineItem(record, index === 0),
                  )}
              />
              {evidence.length > 5 ? (
                <details className="mt-3 border-t border-border/60 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Show all {evidence.length} ({evidence.length} total)
                  </summary>
                  <div className="mt-3">
                    <EvidenceTimeline
                      label="All evidence"
                      items={evidence
                        .slice(5)
                        .map((record) => evidenceTimelineItem(record, false))}
                    />
                  </div>
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
