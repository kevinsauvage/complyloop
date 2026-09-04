import { ConnectProjectCard, ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import {
  FirstAssessmentChecklist,
  UnableToVerifyRuntimeHint,
} from "@/components/dashboard/first-assessment-checklist";
import { AssessmentJobStatusLive } from "@/components/dashboard/assessment-job-status-live";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { DashboardWorkspaceToolbar } from "@/components/dashboard/dashboard-workspace-toolbar";
import { projectDescription } from "@/components/dashboard/project-description";
import { EmptyState } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import {
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/prioritization";
import type { RequirementStatus } from "@/core/statuses";
import { runAssessmentAction } from "@/server/actions/assessment";
import { recentAssessmentJobsForProject } from "@/server/assessment-jobs";
import {
  findingsInScope,
  requirementsInScope,
} from "@/server/assessment-status";
import { projectCapabilities } from "@/server/project-capabilities";
import { controlById, getWorkspace } from "@/server/workspace";
import { frameworkForProject } from "@/server/report";
import { controlForDisplay } from "@/adapters/control-theme";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { db, project, access, visibleProjects, activeOrgId } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  const hasConnectedProject = visibleProjects.length > 0;

  const assessAction = caps.canAssess ? (
    <StatefulActionForm
      action={runAssessmentAction}
      submitLabel="Run assessment"
      pendingLabel="Assessing…"
    />
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
          toolbar={<DashboardWorkspaceToolbar />}
          actions={assessAction}
        />
        <ConnectProjectCard>
          <ConnectProjectPanel defaultOpen />
        </ConnectProjectCard>
        <EmptyState title="Connect a repository to get started" action={undefined}>
          <p>
            Link a GitHub project above, then run an assessment to populate your
            dashboard with requirements, findings, and evidence.
          </p>
        </EmptyState>
      </div>
    );
  }

  const latestAssessment = db.assessments
    .filter((assessment) => assessment.projectId === project.id)
    .at(-1);
  const requirements = requirementsInScope(db.requirements, project);
  const projectFindings = findingsInScope(db.findings, project);
  const openFindings = prioritizeFindings(projectFindings, db.controls);
  const unreadAlerts = db.alerts
    .filter((alert) => alert.projectId === project.id && !alert.read)
    .slice()
    .reverse();
  const regressions = db.evidence
    .filter(
      (record) =>
        record.projectId === project.id &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .slice(-3)
    .reverse();
  const recentVerified = db.evidence
    .filter(
      (record) =>
        (record.projectId === project.id || !record.projectId) &&
        (record.kind === "remediation_verified" ||
          record.kind === "remediation_manually_verified" ||
          record.kind === "finding_resolved"),
    )
    .slice(-5)
    .reverse();
  const recentEvidence = db.evidence
    .filter((record) => record.projectId === project.id || !record.projectId)
    .slice(-6)
    .reverse();
  const clusters = prioritizeClusters(projectFindings, db.controls).slice(0, 5);
  const recentChanges = latestAssessment?.changesSincePrevious ?? [];
  const recentJobs = await recentAssessmentJobsForProject(project.id);

  const counts = new Map<RequirementStatus, number>();
  for (const requirement of requirements) {
    counts.set(requirement.status, (counts.get(requirement.status) ?? 0) + 1);
  }

  const failedCount = counts.get("failed") ?? 0;
  const passedCount = counts.get("passed") ?? 0;
  const totalRequirements = requirements.length;
  const passRate =
    totalRequirements > 0
      ? `${Math.round((passedCount / totalRequirements) * 100)}%`
      : "—";

  const quickStats = latestAssessment
    ? [
        {
          label: "Open findings",
          value: openFindings.length,
          href: openFindings.length > 0 ? "/findings" : undefined,
          tone: openFindings.length > 0 ? ("warning" as const) : ("success" as const),
        },
        {
          label: "Unread alerts",
          value: unreadAlerts.length,
          tone: unreadAlerts.length > 0 ? ("warning" as const) : ("muted" as const),
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
          tone: "signal" as const,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-2">
      <DashboardOverview
        title={project.name}
        repoLabel={project.github?.fullName ?? project.sourceRef ?? undefined}
        description={projectDescription(project, latestAssessment)}
        stats={quickStats}
        toolbar={<DashboardWorkspaceToolbar />}
        meta={
          latestAssessment ? (
            <RuntimeCoverageChip
              project={project}
              engines={latestAssessment.engines}
              compact
            />
          ) : null
        }
        actions={caps.canAssess ? assessAction : undefined}
      />

      {!caps.canAssess ? assessAction : null}

      {!hasConnectedProject ? (
        <ConnectProjectCard>
          <ConnectProjectPanel defaultOpen />
        </ConnectProjectCard>
      ) : null}

      {!latestAssessment && hasConnectedProject ? (
        <FirstAssessmentChecklist
          project={project}
          canAssess={caps.canAssess}
          canConnect={caps.canConnect}
          hasAssessment={false}
        />
      ) : null}

      {latestAssessment ? (
        <>
          {unreadAlerts.length > 0 ? (
            <DashboardAlertsCard alerts={unreadAlerts} project={project} />
          ) : null}

          <DashboardSection
            title="Compliance snapshot"
            description="Requirement statuses from your latest assessment."
          >
            <UnableToVerifyRuntimeHint
              count={counts.get("unable_to_verify") ?? 0}
              hasPreviewUrl={Boolean(project.runtimeBaseUrl?.trim())}
            />
            <DashboardStatusCounts counts={counts} />
          </DashboardSection>

          <DashboardSection
            title="Pipeline"
            description="Recent assessment job history."
          >
            <AssessmentJobStatusLive
              key={recentJobs.map((job) => `${job.id}:${job.status}`).join("|")}
              projectId={project.id}
              initialJobs={recentJobs}
              canRetry={caps.canAssess}
            />
          </DashboardSection>

          <DashboardSection
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
              controlById={(controlId) =>
                controlForDisplay(
                  controlById(db, controlId),
                  frameworkForProject(db, project).id,
                )
              }
            />
          </DashboardSection>
        </>
      ) : null}
    </div>
  );
}
