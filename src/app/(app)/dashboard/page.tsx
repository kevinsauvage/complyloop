import type { Metadata } from "next";
import { Suspense } from "react";

import { shippedCatalog } from "@complyloop/analysis-core/adapters/catalog";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";

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
import { projectDescription } from "@/components/dashboard/project-description";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { PageActionLink, PageSection } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { countByStatus,latestAssessmentFor } from "@/core/assessment-helpers";
import {
  clusterFindings,
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/finding-priority";
import { loadActiveProjectPage } from "@/server/active-project-page";
import { getProjectRuntime } from "@/server/project-runtime";
import { findingsInScope, requirementsInScope } from "@/server/project-scope";
import { displayControl } from "@/server/report";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Compliance snapshot, pipeline activity, and next actions for the active project.",
};

export default async function DashboardPage() {
  const { project, visibleProjects, caps } = await loadActiveProjectPage();
  const hasConnectedProject = visibleProjects.length > 0;

  const assessAction = caps.canAssess ? (
    <AssessmentRunForm />
  ) : (
    <PermissionNotice>
      View-only role — you can browse results but not run assessments.
    </PermissionNotice>
  );

  if (!project) {
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

  const runtime = await getProjectRuntime(project.id, {
    findingStatuses: ["open"],
  });
  const latestAssessment = latestAssessmentFor(runtime.assessments, project.id);
  const requirements = requirementsInScope(runtime.requirements, project);
  const projectFindings = findingsInScope(runtime.findings, project);
  const controls = shippedCatalog().controls;
  const rawClusters = clusterFindings(projectFindings, controls);
  const openFindings = prioritizeFindings(
    projectFindings,
    controls,
    rawClusters,
  );
  const unreadAlerts = runtime.alerts
    .filter((alert) => alert.projectId === project.id && !alert.read)
    .slice()
    .reverse();
  const regressions = runtime.evidence
    .filter(
      (record) =>
        record.projectId === project.id &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .slice(-3)
    .reverse();
  const recentVerified = runtime.evidence
    .filter(
      (record) =>
        (record.projectId === project.id || !record.projectId) &&
        (record.kind === "remediation_verified" ||
          record.kind === "remediation_manually_verified" ||
          (record.kind === "finding" && record.detail?.event === "resolved")),
    )
    .slice(-5)
    .reverse();
  const recentEvidence = runtime.evidence
    .filter((record) => record.projectId === project.id || !record.projectId)
    .slice(-6)
    .reverse();
  const clusters = prioritizeClusters(
    projectFindings,
    controls,
    rawClusters,
  ).slice(0, 5);
  const recentChanges = latestAssessment?.changesSincePrevious ?? [];

  const counts = countByStatus(requirements, REQUIREMENT_STATUSES);

  const failedCount = counts.failed;
  const passedCount = counts.passed;
  const totalRequirements = requirements.length;
  const hasPreviewUrl = Boolean(project.runtimeBaseUrl?.trim());
  const showFirstRun = !latestAssessment && hasConnectedProject;
  const passRateValue =
    totalRequirements > 0
      ? Math.round((passedCount / totalRequirements) * 100)
      : null;
  const passRate = passRateValue === null ? "—" : `${passRateValue}%`;
  const passRateTone =
    passRateValue === null
      ? ("muted" as const)
      : passRateValue >= 90
        ? ("success" as const)
        : passRateValue >= 70
          ? ("signal" as const)
          : ("review" as const);

  const quickStats = latestAssessment
    ? [
        {
          label: "Open findings",
          value: openFindings.length,
          href: openFindings.length > 0 ? "/findings" : undefined,
          tone:
            openFindings.length > 0
              ? ("warning" as const)
              : ("success" as const),
        },
        {
          label: "Unread alerts",
          value: unreadAlerts.length,
          href:
            unreadAlerts.length > 0 ? "#regression-alerts-heading" : undefined,
          tone:
            unreadAlerts.length > 0 ? ("warning" as const) : ("muted" as const),
        },
        {
          label: "Failed requirements",
          value: failedCount,
          href: failedCount > 0 ? "/requirements?status=failed" : undefined,
          tone: failedCount > 0 ? ("warning" as const) : ("muted" as const),
        },
        {
          label: "Pass rate",
          value: passRate,
          tone: passRateTone,
        },
      ]
    : [];

  // Single next action, highest priority first: alerts → failed
  // requirements → open findings → preview-URL coverage gap.
  const nextAction =
    unreadAlerts.length > 0
      ? {
          title: `${unreadAlerts.length} unread alert${unreadAlerts.length === 1 ? "" : "s"}`,
          description:
            "Requirement statuses changed since your last review — confirm each one before it becomes a regression.",
          cta: "Review alerts",
          href: "#regression-alerts-heading",
        }
      : failedCount > 0
        ? {
            title: `${failedCount} failed requirement${failedCount === 1 ? "" : "s"}`,
            description:
              "These requirements have open findings. Fix or dismiss the findings to move them to Passed.",
            cta: "See failed requirements",
            href: "/requirements?status=failed",
          }
        : openFindings.length > 0
          ? {
              title: `${openFindings.length} open finding${openFindings.length === 1 ? "" : "s"}`,
              description:
                "Triage the queue in priority order — fix each finding to Verified.",
              cta: "Triage findings",
              href: "/findings?tab=open",
            }
          : counts.unable_to_verify > 0 && !hasPreviewUrl
            ? {
                title: "Unlock live-page checks",
                description: `${counts.unable_to_verify} requirement${counts.unable_to_verify === 1 ? "" : "s"} can't be verified without a preview URL — contrast, landmarks, and page structure stay unchecked.`,
                cta: "Set preview URL",
                href: "/settings",
              }
            : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardOverview
        title={project.name}
        repoLabel={project.github?.fullName ?? project.sourceRef ?? undefined}
        description={projectDescription(project, latestAssessment)}
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

      {latestAssessment ? (
        <>
          {nextAction ? (
            <section
              aria-labelledby="next-action-heading"
              className="surface-panel rounded-2xl border-signal/30 bg-signal/5 p-5 sm:p-6"
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
              hasPreviewUrl={Boolean(project.runtimeBaseUrl?.trim())}
              runtimeError={latestAssessment.engines?.runtimeError}
            />
            <DashboardStatusCounts counts={counts} />
          </PageSection>

          <Suspense fallback={<DashboardPipelineSkeleton />}>
            <DashboardPipelineSection
              projectId={project.id}
              canRetry={caps.canAssess}
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
