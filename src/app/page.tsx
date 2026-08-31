import { ConnectProjectCard, ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import {
  FirstAssessmentChecklist,
  UnableToVerifyRuntimeHint,
} from "@/components/dashboard/first-assessment-checklist";
import { AssessmentJobStatusLive } from "@/components/dashboard/assessment-job-status-live";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { projectDescription } from "@/components/dashboard/project-description";
import { EmptyState, PageHeader } from "@/components/page-primitives";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { db, project, access, visibleProjects, activeOrgId } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);
  const hasConnectedProject = visibleProjects.length > 0;

  if (!project) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Connect a repository to start the compliance loop."
        />
        <div className="mb-6">
          <ConnectProjectCard>
            <ConnectProjectPanel defaultOpen />
          </ConnectProjectCard>
        </div>
        <EmptyState title="Connect a repository to get started" action={undefined}>
          <p>
            Connect a GitHub project above, then run an assessment to walk the
            compliance loop.
          </p>
        </EmptyState>
      </>
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={projectDescription(project, latestAssessment)}
      >
        {caps.canAssess ? assessAction : null}
      </PageHeader>

      {!caps.canAssess ? <div className="mb-6">{assessAction}</div> : null}

      {!hasConnectedProject ? (
        <div className="mb-6">
          <ConnectProjectCard>
            <ConnectProjectPanel defaultOpen />
          </ConnectProjectCard>
        </div>
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
        <div className="flex flex-col gap-6">
          <RuntimeCoverageChip
            project={project}
            engines={latestAssessment.engines}
          />
          <UnableToVerifyRuntimeHint
            count={counts.get("unable_to_verify") ?? 0}
            hasPreviewUrl={Boolean(project.runtimeBaseUrl?.trim())}
          />
          <DashboardStatusCounts counts={counts} />
          <AssessmentJobStatusLive
            key={recentJobs.map((job) => `${job.id}:${job.status}`).join("|")}
            projectId={project.id}
            initialJobs={recentJobs}
            canRetry={caps.canAssess}
          />
          <DashboardAlertsCard alerts={unreadAlerts} project={project} />
          <DashboardActivitySections
            regressions={regressions}
            recentChanges={recentChanges}
            clusters={clusters}
            openFindings={openFindings}
            recentVerified={recentVerified}
            recentEvidence={recentEvidence}
            controlById={(controlId) => controlById(db, controlId)}
          />
        </div>
      ) : null}
    </>
  );
}
