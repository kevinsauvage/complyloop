import { primaryButton, secondaryButton } from "@/components/action-button-styles";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardActivitySections } from "@/components/dashboard/dashboard-activity-sections";
import { DashboardAlertsCard } from "@/components/dashboard/dashboard-alerts-card";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import { projectDescription } from "@/components/dashboard/project-description";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
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
  const orgName = project.orgId
    ? db.organizations.find((org) => org.id === project.orgId)?.name
    : undefined;
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={projectDescription(project, latestAssessment, orgName)}
      >
        {project.source === "sample" && caps.canRemediate ? (
          <StatefulActionForm
            action={resetProjectAction}
            submitLabel="Reset sample project"
            pendingLabel="Resetting…"
            submitClassName={secondaryButton}
            confirmMessage="Reset the sample project workspace to its original files? Unsaved local edits in the sample will be lost."
          />
        ) : null}
        {caps.canAssess ? (
          <StatefulActionForm
            action={runAssessmentAction}
            submitLabel="Run assessment"
            pendingLabel="Assessing…"
            submitClassName={primaryButton}
          />
        ) : (
          <PermissionNotice>
            View-only role — you can browse results but not run assessments.
          </PermissionNotice>
        )}
      </PageHeader>

      <div className="mb-6">
        <Card title="Connect a project">
          <ConnectProjectPanel />
        </Card>
      </div>

      {!latestAssessment ? (
        <EmptyState title="Run your first assessment">
          <p>
            &quot;{project.name}&quot; is connected. Run an assessment to evaluate it
            against the RGAA/WCAG requirements, or connect a GitHub repository /
            local path above.
          </p>
        </EmptyState>
      ) : (
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
      )}
    </>
  );
}
