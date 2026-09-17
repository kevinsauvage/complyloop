import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ConnectProjectCard,
  ConnectProjectPanel,
} from "@/components/connect-project-panel";
import { AssessmentRunForm } from "@/components/dashboard/assessment-run-form";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import {
  DashboardPipelineSection,
  DashboardPipelineSkeleton,
} from "@/components/dashboard/dashboard-pipeline-section";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import {
  FirstAssessmentChecklist,
  UnableToVerifyRuntimeHint,
} from "@/components/dashboard/first-assessment-checklist";
import { projectSourceBit } from "@/components/dashboard/project-description";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { FormattedDateTime } from "@/components/formatted-datetime";
import { PageActionLink, PageSection } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { hasPreviewUrl } from "@/core/assessment-helpers";
import { displayControl } from "@/server/reporting/report";
import { loadDashboardView } from "@/server/workspace/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Compliance snapshot, pipeline activity, and next actions for the active project.",
};

// Manual runs only enqueue (see `runAssessmentAction`): the click resolves
// fast and the scan drains through the worker queue, so this segment needs
// no extended timeout — the worker route (`/api/internal/jobs/run`) owns
// its own `maxDuration` budget instead.

export default async function DashboardPage() {
  const view = await loadDashboardView();
  const { visibleProjects } = view;
  const hasConnectedProject = visibleProjects.length > 0;

  if (!view.project) {
    return (
      <div className="flex flex-col gap-6">
        <DashboardOverview
          title="Welcome to ComplyLoop"
          description="Connect a GitHub repository to start the compliance loop — from requirement to verified evidence."
          stats={[]}
          actions={undefined}
        />
        <ConnectProjectCard>
          <ConnectProjectPanel defaultOpen />
        </ConnectProjectCard>
      </div>
    );
  }

  const { caps } = view;
  const assessAction = caps.canAssess ? (
    <AssessmentRunForm projectId={view.project.id} />
  ) : (
    <PermissionNotice>
      View-only role — you can browse results but not run assessments.
    </PermissionNotice>
  );

  const {
    project,
    latestAssessment,
    counts,
    openFindings,
    unreadAlerts,
    regressions,
    recentVerified,
    recentEvidence,
    clusters,
    recentChanges,
    quickStats,
    nextAction,
    showFirstRun,
  } = view;

  return (
    <div className="flex flex-col gap-6">
      <DashboardOverview
        title={project.name}
        repoLabel={project.github?.fullName ?? project.sourceRef ?? undefined}
        description={
          latestAssessment ? (
            <>
              {projectSourceBit(project)} · assessed{" "}
              <FormattedDateTime iso={latestAssessment.completedAt} /> ·{" "}
              {latestAssessment.filesScanned} files
            </>
          ) : (
            `${projectSourceBit(project)} · not assessed yet`
          )
        }
        stats={quickStats}
        meta={
          latestAssessment ? (
            <RuntimeCoverageChip
              project={project}
              engines={latestAssessment.engines}
              compact
              canConnect={caps.canConnect}
            />
          ) : null
        }
        // The header owns Run assessment once results exist; before the first
        // assessment the checklist below owns the CTA (no duplicates).
        actions={caps.canAssess && latestAssessment ? assessAction : undefined}
      />

      {!caps.canAssess ? assessAction : null}

      {!hasConnectedProject ? (
        <ConnectProjectCard>
          <ConnectProjectPanel defaultOpen />
        </ConnectProjectCard>
      ) : null}

      {showFirstRun ? (
        <FirstAssessmentChecklist
          project={project}
          canAssess={caps.canAssess}
          canConnect={caps.canConnect}
        />
      ) : null}

      {/* The pipeline stays visible before the first assessment completes so
          a queued/running first job is never invisible: without this the page
          looks stuck on the checklist while the worker is working. Empty job
          history renders nothing (see AssessmentJobStatus). */}
      {showFirstRun ? (
        <Suspense fallback={<DashboardPipelineSkeleton />}>
          <DashboardPipelineSection
            projectId={project.id}
            canRetry={caps.canAssess}
            canCancel={caps.canAssess}
          />
        </Suspense>
      ) : null}

      {latestAssessment ? (
        <>
          {nextAction ? (
            <section
              aria-labelledby="next-action-heading"
              className="surface-panel rounded-xl border-signal/30 bg-signal/5 p-5 sm:p-6"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-signal">
                Next action
              </p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    id="next-action-heading"
                    className="text-lg font-semibold tracking-tight"
                  >
                    {nextAction.title}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {nextAction.description}
                  </p>
                </div>
                <PageActionLink href={nextAction.href}>
                  {nextAction.cta}
                </PageActionLink>
              </div>
            </section>
          ) : null}

          {unreadAlerts.length > 0 ? (
            <DashboardAlertsCard alerts={unreadAlerts} project={project} />
          ) : null}

          <PageSection
            title="Compliance snapshot"
            description="Requirement statuses from your latest assessment."
          >
            <UnableToVerifyRuntimeHint
              count={counts.unable_to_verify}
              hasPreviewUrl={hasPreviewUrl(project)}
              runtimeError={latestAssessment.engines?.runtimeError}
            />
            <DashboardStatusCounts counts={counts} />
          </PageSection>

          <Suspense fallback={<DashboardPipelineSkeleton />}>
            <DashboardPipelineSection
              projectId={project.id}
              canRetry={caps.canAssess}
              canCancel={caps.canAssess}
            />
          </Suspense>

          <PageSection
            title="Activity"
            description="Findings, changes, and evidence from recent work."
          >
            <DashboardActivitySections
              regressions={regressions}
              recentChanges={recentChanges}
              clusters={clusters}
              openFindings={openFindings}
              recentVerified={recentVerified}
              recentEvidence={recentEvidence}
              controlById={(controlId) => displayControl(controlId, project)}
              hideRegressions={unreadAlerts.length > 0}
            />
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
