import Link from "next/link";
import {
  RequirementStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { ConnectProjectPanel } from "@/components/connect-project-panel";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import {
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/prioritization";
import type { Project, RequirementStatus } from "@/core/types";
import {
  markAlertReadAction,
  resetProjectAction,
  runAssessmentAction,
} from "@/server/actions";
import { controlById, getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

const STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

function projectDescription(
  project: Project,
  latestAssessment: { completedAt: string; filesScanned: number } | undefined,
  orgName?: string,
): string {
  let sourceBit: string;
  switch (project.source) {
    case "github":
      sourceBit = `GitHub ${project.github?.fullName ?? project.sourceRef ?? "repo"}`;
      break;
    case "git":
      sourceBit = `cloned from ${project.sourceRef ?? "git"}`;
      break;
    case "local":
      sourceBit = project.rootPath;
      break;
    case "sample":
      sourceBit = "sample workspace";
      break;
    default: {
      const _exhaustive: never = project.source;
      throw new Error(`Unhandled project source: ${_exhaustive}`);
    }
  }
  const assessmentBit = latestAssessment
    ? `last assessed ${formatDateTime(latestAssessment.completedAt)}, ${latestAssessment.filesScanned} files scanned`
    : "not assessed yet";
  const orgBit = orgName ? ` · org ${orgName}` : "";
  return `Project "${project.name}" (${sourceBit}${orgBit}) — ${assessmentBit}`;
}

export default async function DashboardPage() {
  const { db, project, visibleProjects, organizations, activeOrgId } =
    await getWorkspace();
  const orgName = project.orgId
    ? db.organizations.find((org) => org.id === project.orgId)?.name
    : undefined;
  const latestAssessment = db.assessments
    .filter((assessment) => assessment.projectId === project.id)
    .at(-1);
  const requirements = db.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const projectFindings = db.findings.filter(
    (finding) => finding.projectId === project.id,
  );
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
        {project.source === "sample" ? (
          <form action={resetProjectAction}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Reset sample project
            </button>
          </form>
        ) : null}
        <form action={runAssessmentAction}>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Run assessment
          </button>
        </form>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        {activeOrgId ? (
          <OrgSwitcher
            organizations={organizations}
            activeOrgId={activeOrgId}
          />
        ) : null}
        <ProjectSwitcher
          projects={visibleProjects}
          activeProjectId={project.id}
        />
      </div>

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATUS_ORDER.map((status) => (
              <Card key={status}>
                <p className="text-3xl font-semibold">{counts.get(status) ?? 0}</p>
                <div className="mt-2">
                  <RequirementStatusBadge status={status} />
                </div>
              </Card>
            ))}
          </div>

          {unreadAlerts.length > 0 ? (
            <Card title="Regression alerts" className="border-red-200">
              <ul className="flex flex-col gap-3">
                {unreadAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-start justify-between gap-3 text-sm text-red-800"
                  >
                    <div>
                      <p>{alert.summary}</p>
                      {(() => {
                        const bits: string[] = [];
                        if (typeof alert.detail?.trigger === "string") {
                          bits.push(`Trigger: ${alert.detail.trigger}`);
                        }
                        if (
                          typeof alert.detail?.from === "string" &&
                          typeof alert.detail?.to === "string"
                        ) {
                          bits.push(`${alert.detail.from} → ${alert.detail.to}`);
                        }
                        if (typeof alert.detail?.changeContext === "string") {
                          bits.push(alert.detail.changeContext);
                        }
                        if (bits.length === 0) return null;
                        return (
                          <p className="mt-1 text-xs text-red-700/80">
                            {bits.join(" · ")}
                          </p>
                        );
                      })()}
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {formatDateTime(alert.at)}
                      </p>
                    </div>
                    <form action={markAlertReadAction.bind(null, alert.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-50"
                      >
                        Dismiss
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {regressions.length > 0 ? (
            <Card title="Recent compliance regressions" className="border-red-200">
              <ul className="flex flex-col gap-2">
                {regressions.map((record) => (
                  <li key={record.id} className="text-sm text-red-800">
                    {record.summary}
                    <span className="ml-2 text-xs text-zinc-400">
                      {formatDateTime(record.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {recentChanges.length > 0 ? (
            <Card title="Changes since previous assessment">
              <ul className="flex flex-col gap-2">
                {recentChanges.slice(0, 8).map((change) => (
                  <li
                    key={change.filePath}
                    className="font-mono text-sm text-zinc-700"
                  >
                    {change.filePath}
                    {change.author ? (
                      <span className="ml-2 font-sans text-xs text-zinc-500">
                        {change.author}
                        {change.commitSubject
                          ? ` — ${change.commitSubject}`
                          : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {clusters.length > 0 ? (
            <Card title="Likely shared root causes">
              <ul className="flex flex-col gap-2">
                {clusters.map((cluster) => (
                  <li key={cluster.id} className="text-sm text-zinc-700">
                    <Link href="/findings" className="hover:underline">
                      {cluster.label}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-400">
                      {cluster.findingIds.length} findings
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Needs attention">
            {openFindings.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No open findings. Everything detected has been fixed, verified, or
                reviewed.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {openFindings.slice(0, 6).map((finding) => {
                  const control = controlById(db, finding.controlId);
                  return (
                    <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/findings/${finding.id}`}
                        className="group flex flex-wrap items-center gap-3"
                      >
                        <SeverityBadge severity={finding.severity} />
                        <span className="text-sm font-medium group-hover:underline">
                          {control.code} — {control.title}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">
                          {finding.location.filePath}:{finding.location.line}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Recent activity">
            <ul className="flex flex-col gap-2">
              {recentEvidence.map((record) => (
                <li key={record.id} className="text-sm text-zinc-600">
                  {record.summary}
                  <span className="ml-2 text-xs text-zinc-400">
                    {formatDateTime(record.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
