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
  const { db, project, access } = await getWorkspace();
  const caps = projectCapabilities(project, access);
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
        {latestAssessment ? (
          <ConnectProjectPanel defaultOpen={false} />
        ) : null}
      </PageHeader>

      {!caps.canAssess ? <div className="mb-6">{assessAction}</div> : null}

      {!latestAssessment ? (
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

      {!latestAssessment ? (
        <EmptyState
          title="Run your first assessment"
          action={caps.canAssess ? assessAction : undefined}
        >
          <p>
            &quot;{project.name}&quot; is connected. Run an assessment to evaluate
            it against the RGAA/WCAG requirements, or connect a GitHub repository
            / local path above.
          </p>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {caps.canConnect ? (
            <Card>
              <CardHeader>
                <CardTitle>Runtime audit</CardTitle>
                <CardDescription>
                  Optional preview URL so label/name checks use the rendered DOM
                  instead of design-system primitives in source.
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
          ) : null}
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
      )}
    </>
  );
}
