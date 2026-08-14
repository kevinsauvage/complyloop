import Link from "next/link";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import { AssessmentJobStatus } from "@/components/dashboard/assessment-job-status";
import { projectDescription } from "@/components/dashboard/project-description";
import { EmptyState, PageHeader } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/prioritization";
import type { RequirementStatus } from "@/core/statuses";
import { runAssessmentAction } from "@/server/actions/assessment";
import { recentAssessmentJobsForProject } from "@/server/assessment-jobs";
import { projectCapabilities } from "@/server/project-capabilities";
import {
  findingsForProject,
  requirementsForProject,
} from "@/server/project-visibility";
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
          <Card>
            <CardHeader>
              <CardTitle>Connect a project</CardTitle>
              <CardDescription>
                Link a GitHub repository to assess against RGAA/WCAG.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectProjectPanel defaultOpen />
            </CardContent>
          </Card>
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
  const requirements = requirementsForProject(db.requirements, project.id);
  const projectFindings = findingsForProject(db.findings, project.id);
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
          <Card>
            <CardHeader>
              <CardTitle>Connect a project</CardTitle>
              <CardDescription>
                Link a GitHub repository to assess against RGAA/WCAG.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectProjectPanel defaultOpen />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!latestAssessment && hasConnectedProject ? (
        <EmptyState
          title="Run your first assessment"
          action={caps.canAssess ? assessAction : undefined}
        >
          <p>
            &quot;{project.name}&quot; is connected. Run an assessment to evaluate
            it against the RGAA/WCAG requirements.
            {caps.canConnect ? (
              <>
                {" "}
                Optionally set a{" "}
                <Link
                  href="/settings"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  preview URL in Settings
                </Link>{" "}
                for rendered-page checks.
              </>
            ) : null}
          </p>
        </EmptyState>
      ) : null}

      {latestAssessment ? (
        <div className="flex flex-col gap-6">
          <DashboardStatusCounts counts={counts} />
          <AssessmentJobStatus jobs={recentJobs} />
          <DashboardAlertsCard alerts={unreadAlerts} />
          <DashboardActivitySections
            regressions={regressions}
            recentChanges={recentChanges}
            clusters={clusters}
            openFindings={openFindings}
            recentEvidence={recentEvidence}
            controlById={(controlId) => controlById(db, controlId)}
          />
        </div>
      ) : null}
    </>
  );
}
