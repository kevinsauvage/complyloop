import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ConnectProjectCard,
  ConnectProjectPanel,
} from "@/components/github/connect-project-panel";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import {
  PageActionLink,
  PageSection,
} from "@/components/primitives/page-primitives";
import { PermissionNotice } from "@/components/primitives/permission-notice";
import { hasPreviewUrl } from "@/core/assessment/assessment-helpers";
import { displayControl } from "@/server/reporting/report";
import { loadDashboardView } from "@/server/workspace/dashboard-view";

import { AssessmentRunForm } from "./_components/assessment-run-form";
import { AssessmentTrend } from "./_components/assessment-trend";
import {
  DashboardActivityFeed,
  DashboardChangesCard,
  DashboardFindingsQueue,
  DashboardRegressionsBanner,
} from "./_components/dashboard-activity-sections";
import { DashboardAlertsCard } from "./_components/dashboard-alerts-card";
import { DashboardOverview } from "./_components/dashboard-overview";
import {
  DashboardPipelineSection,
  DashboardPipelineSkeleton,
} from "./_components/dashboard-pipeline-section";
import { DashboardStatusCounts } from "./_components/dashboard-status-counts";
import {
  FirstAssessmentChecklist,
  UnableToVerifyRuntimeHint,
} from "./_components/first-assessment-checklist";
import { RuntimeCoverageChip } from "./_components/runtime-coverage-chip";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Compliance snapshot, pipeline activity, and next actions for the active project.",
};

// Manual runs only enqueue (see `runAssessmentAction`): the click resolves
// fast and the scan drains through the GitHub Actions worker queue, so this
// segment needs no extended timeout.

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
    <AssessmentRunForm
      projectId={view.project.id}
      changedCount={view.recentChanges.length}
    />
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
    openCount,
    unreadAlerts,
    regressions,
    recentVerified,
    recentEvidence,
    recentChanges,
    quickStats,
    nextAction,
    showFirstRun,
    trend,
  } = view;
  const controlById = (controlId: string) => displayControl(controlId, project);
  // Alerts, regressions and the findings queue already carry their own next
  // step, and the loader's next action restates one of them. Only the
  // preview-URL gap has no other home on this page.
  const showNextAction =
    Boolean(nextAction) && unreadAlerts.length === 0 && openCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardOverview
        // The project header above names the project and its repository.
        title="Dashboard"
        description={
          latestAssessment ? (
            <>
              Assessed <FormattedDateTime iso={latestAssessment.completedAt} />{" "}
              · {latestAssessment.filesScanned} files
            </>
          ) : (
            "Not assessed yet"
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
          looks stuck on the checklist while the worker is working. It renders
          nothing when no job needs attention. */}
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
          {unreadAlerts.length > 0 ? (
            <DashboardAlertsCard alerts={unreadAlerts} project={project} />
          ) : (
            <>
              <DashboardRegressionsBanner
                regressions={regressions}
                controlById={controlById}
              />
              {showNextAction && nextAction ? (
                <section
                  aria-labelledby="next-action-heading"
                  className="surface-panel rounded-xl border-signal/30 bg-signal/5 px-4 py-3 sm:px-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <h2
                        id="next-action-heading"
                        className="text-sm font-semibold tracking-tight"
                      >
                        {nextAction.title}
                      </h2>
                      <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                        {nextAction.description}
                      </p>
                    </div>
                    <PageActionLink href={nextAction.href}>
                      {nextAction.cta}
                    </PageActionLink>
                  </div>
                </section>
              ) : null}
            </>
          )}

          <PageSection
            title="Compliance snapshot"
            description="Requirement statuses from your latest assessment."
            className="pt-0"
          >
            <UnableToVerifyRuntimeHint
              count={counts.unable_to_verify}
              hasPreviewUrl={hasPreviewUrl(project)}
              runtimeError={latestAssessment.engines?.runtimeError}
            />
            <div className="surface-panel overflow-hidden rounded-xl">
              <div className="grid divide-y divide-border/60 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
                <div className="p-4 sm:p-5 lg:col-span-7">
                  <DashboardStatusCounts counts={counts} />
                </div>
                <div className="p-4 sm:p-5 lg:col-span-5">
                  <AssessmentTrend trend={trend} />
                </div>
              </div>
            </div>
          </PageSection>

          <div className="grid items-start gap-4 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
              <DashboardFindingsQueue
                openFindings={openFindings}
                openCount={openCount}
                controlById={controlById}
              />
              <DashboardChangesCard recentChanges={recentChanges} />
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
              <Suspense fallback={<DashboardPipelineSkeleton />}>
                <DashboardPipelineSection
                  projectId={project.id}
                  canRetry={caps.canAssess}
                  canCancel={caps.canAssess}
                />
              </Suspense>

              <DashboardActivityFeed
                recentVerified={recentVerified}
                recentEvidence={recentEvidence}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
