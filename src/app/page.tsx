import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import { projectDescription } from "@/components/dashboard/project-description";
import { PermissionNotice } from "@/components/permission-notice";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { EmptyState, PageHeader } from "@/components/page-primitives";
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
import type { RequirementStatus } from "@/core/types";
import {
  resetProjectAction,
  runAssessmentAction,
} from "@/server/actions/assessment";
import { projectCapabilities } from "@/server/project-capabilities";
import {
  findingsForProject,
  requirementsForProject,
} from "@/server/project-visibility";
import { controlById, getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { db, project, access, visibleProjects } = await getWorkspace();
  const caps = projectCapabilities(project, access);
  const hasConnectedProject = visibleProjects.some(
    (candidate) => candidate.source !== "sample",
  );
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
        {project.source === "sample" && caps.canRemediate ? (
          <StatefulActionForm
            action={resetProjectAction}
            submitLabel="Reset sample project"
            pendingLabel="Resetting…"
            variant="outline"
            confirmTitle="Reset sample project?"
            confirmMessage="Reset the sample project workspace to its original files? Unsaved local edits in the sample will be lost."
          />
        ) : null}
        {caps.canAssess ? assessAction : null}
      </PageHeader>

      {!caps.canAssess ? <div className="mb-6">{assessAction}</div> : null}

      {!hasConnectedProject ? (
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Connect a project</CardTitle>
              <CardDescription>
                Link a GitHub repository or local path to assess against RGAA/WCAG.
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
          </p>
        </EmptyState>
      ) : null}

      {!latestAssessment && !hasConnectedProject ? (
        <EmptyState
          title="Connect a repository to get started"
          action={undefined}
        >
          <p>
            Connect a GitHub project above, then run an assessment to walk the
            compliance loop.
          </p>
        </EmptyState>
      ) : null}

      {hasConnectedProject && project.source !== "sample" && caps.canConnect ? (
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Runtime audit (preview URL)</CardTitle>
              <CardDescription>
                Staging or preview URL used for rendered-page checks (labels,
                names, headings). Leave empty to assess source only.
                {latestAssessment?.engines?.runtime
                  ? ` Last run audited ${latestAssessment.engines.runtimePagesScanned ?? 0} page(s).`
                  : latestAssessment?.engines?.runtimeError
                    ? ` Last runtime attempt failed: ${latestAssessment.engines.runtimeError}`
                    : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RuntimeAuditForm
                runtimeBaseUrl={project.runtimeBaseUrl}
                runtimeRoutes={project.runtimeRoutes}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {latestAssessment ? (
        <div className="flex flex-col gap-6">
          <DashboardStatusCounts counts={counts} />
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
