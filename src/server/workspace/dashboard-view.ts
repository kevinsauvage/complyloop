/**
 * Dashboard view loader — data-shaping for the `(app)/dashboard` route.
 *
 * Split from the former `project-view.ts` god-loader: one loader module per
 * route. Pages stay routing + rendering: they parse params, call exactly one
 * loader here, and render. No JSX here.
 */
import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";

import {
  countByStatus,
  hasPreviewUrl,
  latestAssessmentFor,
} from "@/core/assessment/assessment-helpers";
import {
  clusterFindings,
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/findings/finding-priority";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import {
  findingsInScope,
  requirementsInScope,
} from "@/server/workspace/project-scope";

export type DashboardView =
  | { project: null; visibleProjects: Project[] }
  | {
      project: Project;
      visibleProjects: Project[];
      hasConnectedProject: boolean;
      caps: ProjectCapabilities;
      latestAssessment: Assessment | undefined;
      counts: Record<(typeof REQUIREMENT_STATUSES)[number], number>;
      openFindings: Finding[];
      unreadAlerts: Alert[];
      regressions: EvidenceRecord[];
      recentVerified: EvidenceRecord[];
      recentEvidence: EvidenceRecord[];
      clusters: ReturnType<typeof prioritizeClusters>;
      recentChanges: NonNullable<Assessment["changesSincePrevious"]>;
      quickStats: Array<{
        label: string;
        value: string | number;
        href?: string;
        tone: "warning" | "success" | "muted" | "signal" | "review";
      }>;
      nextAction: {
        title: string;
        description: string;
        cta: string;
        href: string;
      } | null;
      showFirstRun: boolean;
    };

/**
 * Everything the dashboard renders: scoped runtime rows, status counts,
 * prioritized findings/clusters, alert/regression/evidence windows, and the
 * derived quick-stats + next-action cards. The run-assessment CTA and
 * coverage chip stay in the page (render decisions on `caps`).
 */
export async function loadDashboardView(): Promise<DashboardView> {
  const { project, visibleProjects, caps } = await loadActiveProjectPage();
  if (!project) return { project: null, visibleProjects };
  const hasConnectedProject = visibleProjects.length > 0;

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
  const hasPreviewUrlValue = hasPreviewUrl(project);
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
          : counts.unable_to_verify > 0 && !hasPreviewUrlValue
            ? {
                title: "Unlock live-page checks",
                description: `${counts.unable_to_verify} requirement${counts.unable_to_verify === 1 ? "" : "s"} can't be verified without a preview URL — contrast, landmarks, and page structure stay unchecked.`,
                cta: "Set preview URL",
                href: "/settings",
              }
            : null;

  return {
    project,
    visibleProjects,
    hasConnectedProject,
    caps,
    latestAssessment,
    counts,
    openFindings,
    unreadAlerts,
    regressions,
    recentVerified,
    recentEvidence,
    clusters,
    recentChanges,
    quickStats,
    nextAction,
    showFirstRun,
  };
}
