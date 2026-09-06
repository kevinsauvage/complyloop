import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowUpRight,
  FileSearch,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  TriangleAlert,
} from "lucide-react";
import { SeverityBadge } from "@/components/badges";
import { ConnectProjectCard, ConnectProjectPanel } from "@/components/connect-project-panel";
import { DashboardStatusCounts } from "@/components/dashboard/dashboard-status-counts";
import {
  FirstAssessmentChecklist,
  UnableToVerifyRuntimeHint,
} from "@/components/dashboard/first-assessment-checklist";
import { AssessmentJobStatusLive } from "@/components/dashboard/assessment-job-status-live";
import { RuntimeCoverageChip } from "@/components/dashboard/runtime-coverage-chip";
import { projectDescription } from "@/components/dashboard/project-description";
import { OrgSwitcher } from "@/components/org-switcher";
import {
  EmptyState,
  formatDateTime,
  PageActionLink,
  PageSection,
} from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { ProjectSwitcher } from "@/components/project-switcher";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { latestAssessmentFor } from "@/core/assessment-latest";
import { evidenceKindLabel } from "@/core/status-display";
import {
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/prioritization";
import { cn } from "@/lib/utils";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import {
  type Control,
  type Project,
} from "@complyloop/analysis-core/contract/project-types";
import type { Alert as AlertRecord, EvidenceRecord, FileChange, Finding, FindingCluster } from "@complyloop/db/types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { runAssessmentAction } from "@/server/actions/assessment";
import { markAlertReadAction } from "@/server/actions/alerts";
import { recentAssessmentJobsForProject } from "@/server/assessment-jobs";
import {
  findingsInScope,
  requirementsInScope,
} from "@/server/assessment-status";
import { projectCapabilities } from "@/server/project-capabilities";
import { controlById, getWorkspace } from "@/server/workspace";
import { frameworkForProject } from "@/server/report";
import { controlForDisplay } from "@complyloop/adapters/control-theme";

export const dynamic = "force-dynamic";

type DashboardQuickStat = {
  label: string;
  value: number | string;
  href?: string;
  tone?: "default" | "signal" | "warning" | "success" | "muted";
};

function statToneClass(tone: DashboardQuickStat["tone"]): string {
  switch (tone) {
    case "signal":
      return "border-signal/20 bg-signal/6";
    case "warning":
      return "border-status-failed/20 bg-status-failed/6";
    case "success":
      return "border-status-passed/20 bg-status-passed/6";
    case "muted":
      return "border-border/50 bg-muted/30";
    case "default":
    default:
      return "border-border/60 bg-card/60";
  }
}

function QuickStatTile({ stat }: { stat: DashboardQuickStat }) {
  const inner = (
    <>
      <p
        className={cn(
          "font-mono text-2xl font-semibold tabular-nums tracking-tight",
          stat.tone === "signal" && "text-signal",
          stat.tone === "warning" && "text-status-failed",
          stat.tone === "success" && "text-status-passed",
        )}
      >
        {stat.value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {stat.label}
      </p>
    </>
  );

  const className = cn(
    "surface-panel block w-full min-w-0 rounded-xl px-4 py-3 transition-[border-color,background-color] duration-200",
    statToneClass(stat.tone),
    stat.href &&
      "hover:border-signal/30 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

function DashboardOverview({
  title,
  description,
  repoLabel,
  stats,
  meta,
  toolbar,
  actions,
}: {
  title: string;
  description?: string;
  repoLabel?: string;
  stats: DashboardQuickStat[];
  meta?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="surface-panel card-sheen relative overflow-hidden rounded-2xl backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_80%_70%_at_50%_-30%,color-mix(in_oklch,var(--signal)_14%,transparent),transparent)]"
      />

      <div className="relative z-[1] flex flex-col gap-5 p-5 sm:p-6">
        {toolbar}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {repoLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                  <GitBranch className="size-3.5 shrink-0" aria-hidden />
                  {repoLabel}
                </span>
              ) : null}
              {meta}
            </div>
            <h1
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-3xl"
            >
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>

        {stats.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <li key={stat.label} className="min-w-0">
                <QuickStatTile stat={stat} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Org/project switchers embedded in the dashboard hero (replaces the global context strip). */
async function DashboardWorkspaceToolbar() {
  const { project, visibleProjects, organizations, activeOrgId, access } =
    await getWorkspace();
  const caps = projectCapabilities(project, access, activeOrgId);

  const showOrgSwitcher = Boolean(activeOrgId) && organizations.length > 1;
  const showProjectSwitcher = visibleProjects.length > 1;
  const showAddProject = caps.canConnect && visibleProjects.length > 0;
  const showConnect = caps.canConnect && visibleProjects.length === 0;

  if (!project && !showConnect) return null;

  const hasContent =
    showOrgSwitcher ||
    (project != null && showProjectSwitcher) ||
    showAddProject ||
    showConnect;

  if (!hasContent) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-4">
      {showOrgSwitcher && activeOrgId ? (
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
      ) : null}
      {project && showProjectSwitcher ? (
        <ProjectSwitcher
          projects={visibleProjects}
          activeProjectId={project.id}
        />
      ) : null}
      {showAddProject ? <ConnectProjectPanel defaultOpen={false} /> : null}
      {showConnect ? (
        <ConnectProjectPanel defaultOpen={false} triggerLabel="Connect project" />
      ) : null}
    </div>
  );
}

function alertPrimaryHref(alert: AlertRecord): string | null {
  const findingId = alert.detail?.findingId;
  if (typeof findingId === "string") return `/findings/${findingId}`;
  const controlId = alert.detail?.controlId;
  if (typeof controlId === "string") return "/requirements?status=failed";
  return null;
}

function alertDetailLine(alert: AlertRecord): string | null {
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
  return bits.length > 0 ? bits.join(" · ") : null;
}

function changeContextLink(
  alert: AlertRecord,
  githubFullName?: string,
): { href: string; label: string; external?: boolean } | null {
  const commitSha = alert.detail?.commitSha;
  if (typeof commitSha === "string" && githubFullName) {
    const label =
      typeof alert.detail?.changeContext === "string"
        ? alert.detail.changeContext
        : `Commit ${commitSha.slice(0, 7)}`;
    return {
      href: `https://github.com/${githubFullName}/commit/${commitSha}`,
      label,
      external: true,
    };
  }

  const filePath = alert.detail?.changeFilePath;
  if (typeof filePath === "string") {
    return { href: "/findings", label: filePath };
  }

  if (typeof alert.detail?.changeContext === "string") {
    return null;
  }

  return null;
}

function DashboardAlertsCard({
  alerts,
  project,
}: {
  alerts: AlertRecord[];
  project: Pick<Project, "github">;
}) {
  if (alerts.length === 0) return null;

  const githubFullName = project.github?.fullName;

  return (
    <section
      className="surface-panel rounded-2xl border-destructive/30 bg-destructive/5 p-4 sm:p-5"
      aria-labelledby="regression-alerts-heading"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <div>
            <h2
              id="regression-alerts-heading"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Regression alerts
            </h2>
            <p className="text-xs text-muted-foreground">
              Unread status changes that need review
            </p>
          </div>
        </div>
        <p className="rounded-full border border-destructive/25 bg-background/60 px-2.5 py-1 font-mono text-xs text-destructive tabular-nums">
          {alerts.length} unread
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const detailLine = alertDetailLine(alert);
          const primaryHref = alertPrimaryHref(alert);
          const changeLink = changeContextLink(alert, githubFullName);
          return (
            <li key={alert.id}>
              <Alert
                variant="destructive"
                className="border-destructive/30 bg-background/70 shadow-none"
              >
                <TriangleAlert aria-hidden />
                <AlertTitle className="text-base leading-snug">
                  {primaryHref ? (
                    <Link href={primaryHref} className="hover:text-destructive hover:underline">
                      {alert.summary}
                    </Link>
                  ) : (
                    alert.summary
                  )}
                </AlertTitle>
                <AlertDescription>
                  {detailLine ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed opacity-90">
                      {detailLine}
                    </p>
                  ) : null}
                  {changeLink ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed opacity-90">
                      {changeLink.external ? (
                        <a
                          href={changeLink.href}
                          className="underline underline-offset-4 hover:opacity-100"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {changeLink.label}
                        </a>
                      ) : (
                        <Link
                          href={changeLink.href}
                          className="underline underline-offset-4 hover:opacity-100"
                        >
                          {changeLink.label}
                        </Link>
                      )}
                    </p>
                  ) : typeof alert.detail?.changeContext === "string" ? (
                    <p className="mt-1 font-mono text-xs leading-relaxed opacity-90">
                      {alert.detail.changeContext}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <time className="text-xs opacity-70" dateTime={alert.at}>
                      {formatDateTime(alert.at)}
                    </time>
                    <StatefulActionForm
                      action={markAlertReadAction}
                      submitLabel="Mark as read"
                      pendingLabel="Marking as read…"
                      variant="outline"
                      size="sm"
                    >
                      <input type="hidden" name="alertId" value={alert.id} />
                    </StatefulActionForm>
                  </div>
                </AlertDescription>
              </Alert>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActivityCard({
  title,
  description,
  children,
  className,
  icon: Icon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card
      className={cn(
        "h-full border-border/70 bg-card/80 shadow-none",
        className,
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal/10 text-signal">
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DashboardActivitySections({
  regressions,
  recentChanges,
  clusters,
  openFindings,
  recentVerified,
  recentEvidence,
  controlById,
}: {
  regressions: EvidenceRecord[];
  recentChanges: FileChange[];
  clusters: FindingCluster[];
  openFindings: Finding[];
  recentVerified: EvidenceRecord[];
  recentEvidence: EvidenceRecord[];
  controlById: (controlId: string) => Control;
}) {
  const allClear = openFindings.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {regressions.length > 0 ? (
        <section
          className="surface-panel rounded-2xl border-destructive/30 bg-destructive/5 p-4 sm:p-5 lg:col-span-12"
          aria-labelledby="recent-regressions-heading"
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <Layers className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id="recent-regressions-heading"
                className="text-base font-medium text-foreground"
              >
                Recent compliance regressions
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Requirement statuses that worsened since the last assessment.
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {regressions.map((record) => (
              <li
                key={record.id}
                className="rounded-lg border border-destructive/25 bg-background/70 px-3 py-2 text-sm text-destructive"
              >
                {record.summary}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDateTime(record.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : allClear ? (
        <ActivityCard
          title="No regressions detected"
          description="Requirement statuses have not regressed since your last assessments."
          className="border-status-passed/30 bg-status-passed/5 lg:col-span-12"
          icon={Layers}
        >
          <p className="text-sm text-muted-foreground">
            Keep running assessments after code changes to catch regressions early.
          </p>
        </ActivityCard>
      ) : null}

      <ActivityCard
        title={allClear ? "All clear" : "Needs attention"}
        description={
          allClear
            ? "No open findings — recent verifications and activity below."
            : "Open findings prioritized for remediation."
        }
        className="lg:col-span-7"
        icon={FileSearch}
      >
        {openFindings.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Everything detected has been fixed, verified, or reviewed. Keep
              monitoring for regressions after the next assessment.
            </p>
            {recentVerified.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recently verified
                </h3>
                <ul className="flex flex-col gap-2">
                  {recentVerified.map((record) => (
                    <li
                      key={record.id}
                      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {evidenceKindLabel(record.kind, record.detail)}
                      </span>
                      {" — "}
                      {record.summary}
                      <span className="ml-2 text-xs">
                        {formatDateTime(record.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <PageActionLink href="/evidence">View evidence trail</PageActionLink>
              <PageActionLink href="/requirements">View requirements</PageActionLink>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {openFindings.slice(0, 6).map((finding) => {
              const control = controlById(finding.controlId);
              return (
                <li key={finding.id}>
                  <Link
                    href={`/findings/${finding.id}`}
                    className="group flex flex-wrap items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 outline-none transition-[background-color,border-color] duration-200 hover:border-border/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SeverityBadge severity={finding.severity} />
                    <span className="min-w-0 flex-1 text-sm font-medium group-hover:text-signal">
                      {control.code} — {control.title}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground w-full">
                      {formatLocationRef(finding.location)}
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ActivityCard>

      <div className="flex flex-col gap-4 lg:col-span-5">
        {recentChanges.length > 0 ? (
          <ActivityCard
            title="Changes since last assessment"
            icon={GitCommitHorizontal}
          >
            <ul className="flex flex-col gap-2">
              {recentChanges.slice(0, 6).map((change) => (
                <li
                  key={change.filePath}
                  className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2 font-mono text-xs text-muted-foreground"
                >
                  {change.filePath}
                  {change.author ? (
                    <span className="mt-1 block font-sans text-[11px]">
                      {change.author}
                      {change.commitSubject ? ` — ${change.commitSubject}` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </ActivityCard>
        ) : null}

        {clusters.length > 0 ? (
          <ActivityCard title="Likely shared root causes" icon={Layers}>
            <ul className="flex flex-col gap-2">
              {clusters.map((cluster) => (
                <li
                  key={cluster.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm"
                >
                  <Link href="/findings" className="font-medium hover:text-signal hover:underline">
                    {cluster.label}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {cluster.findingIds.length} findings
                  </span>
                </li>
              ))}
            </ul>
          </ActivityCard>
        ) : null}
      </div>

      <ActivityCard title="Recent activity" className="lg:col-span-12" icon={Layers}>
        {recentEvidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {recentEvidence.map((record) => (
              <li
                key={record.id}
                className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm text-muted-foreground"
              >
                {record.summary}
                <span className="mt-1 block text-xs">
                  {formatDateTime(record.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ActivityCard>
    </div>
  );
}

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

  const latestAssessment = latestAssessmentFor(db.assessments, project.id);
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
          record.kind === "finding" &&
          record.detail?.event === "resolved"),
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

          <PageSection
            title="Compliance snapshot"
            description="Requirement statuses from your latest assessment."
          >
            <UnableToVerifyRuntimeHint
              count={counts.get("unable_to_verify") ?? 0}
              hasPreviewUrl={Boolean(project.runtimeBaseUrl?.trim())}
              runtimeError={latestAssessment.engines?.runtimeError}
            />
            <DashboardStatusCounts counts={counts} />
          </PageSection>

          <PageSection
            title="Pipeline"
            description="Recent assessment job history."
          >
            <AssessmentJobStatusLive
              key={recentJobs.map((job) => `${job.id}:${job.status}`).join("|")}
              projectId={project.id}
              initialJobs={recentJobs}
              canRetry={caps.canAssess}
            />
          </PageSection>

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
              controlById={(controlId) =>
                controlForDisplay(
                  controlById(db, controlId),
                  frameworkForProject(db, project).id,
                )
              }
            />
          </PageSection>
        </>
      ) : null}
    </div>
  );
}