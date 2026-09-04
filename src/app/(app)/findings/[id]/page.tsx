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
import { FindingNextStepPanel } from "@/components/findings/finding-next-step-panel";
import { FindingQueueNav } from "@/components/findings/finding-queue-nav";
import { FindingUnderstandCard } from "@/components/findings/finding-understand-card";
import { RemediationHistory } from "@/components/findings/remediation-history";
import { findingAct } from "@/core/finding-act";
import { evidenceKindLabel } from "@/core/labels";
import {
  findingQueuePosition,
  findingsListHref,
  orderedFindingIdsForQueue,
  parseFindingListParams,
} from "@/core/finding-list-filter";
import { PageHeader, formatDateTime } from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pullRequestUrlFromEvidence } from "@/server/finding-pr-url";
import { latestPatchState } from "@/server/ai-fix-result";
import { buildDeveloperHandoff } from "@/server/handoff";
import { getDrizzle } from "@/server/db-store/client";
import { listEvidenceForFinding } from "@/server/db-store/postgres-queries";
import { buildFindingFilterContext } from "@/server/finding-list-context";
import { projectCapabilities } from "@/server/project-capabilities";
import { resolveVisibleFinding } from "@/server/project-visibility";
import { findingsInScope } from "@/server/assessment-status";
import {
  controlById,
  getWorkspace,
  remediationForFinding,
} from "@/server/workspace";
import { frameworkForProject } from "@/server/report";
import { controlForDisplay } from "@/adapters/control-theme";
import { prioritizeClusters } from "@/core/prioritization";
import { cn } from "@/lib/utils";

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

  const control = controlForDisplay(
    controlById(db, finding.controlId),
    frameworkForProject(db, project).id,
  );
  const remediation = remediationForFinding(db, finding.id);
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

  const scopedFindings = findingsInScope(db.findings, project);
  const queueFilterContext = buildFindingFilterContext(
    db,
    listParams,
    prioritizeClusters(scopedFindings, db.controls),
  );

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

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 shadow-sm">
        <SeverityBadge severity={finding.severity} />
        <ConfidenceBadge confidence={finding.confidence} />
        <RemediationStatusBadge status={remediation.status} />
        <EngineBadge engine={finding.engine ?? "ast"} />
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {finding.checkId}
        </span>
      </div>

      <div className="flex flex-col gap-6">
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
          <details id="copy-handoff">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Copy patch / PR body
            </summary>
            <div className="mt-3">
              <DeveloperHandoffCard handoff={handoff} />
            </div>
          </details>
        ) : null}

        <details>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Evidence trail ({evidence.length})
          </summary>
          <div className="mt-3">
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
                      <Badge variant="secondary" className="text-[10px]">
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
          </div>
        </details>
      </div>
    </>
  );
}
