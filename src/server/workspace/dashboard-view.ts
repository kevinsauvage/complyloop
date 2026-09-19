/**
 * Dashboard view loader — data-shaping for the `(app)/dashboard` route.
 *
 * Split from the former `project-view.ts` god-loader: one loader module per
 * route. Pages stay routing + rendering: they parse params, call exactly one
 * loader here, and render. No JSX here.
 */
import "server-only";

import { cache } from "react";

import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import { listAssessmentHistoryForProject } from "@complyloop/db/repo/assessments";
import { countFindingsByStatusForProject } from "@complyloop/db/repo/findings";

import {
  countByStatus,
  hasPreviewUrl,
  latestAssessmentFor,
} from "@/core/assessment/assessment-helpers";
import { compareFindingsBySeverity } from "@/core/findings/finding-priority";
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
      /** Exact open total from an index-only count (loaded rows are capped). */
      openCount: number;
      unreadAlerts: Alert[];
      regressions: EvidenceRecord[];
      recentVerified: EvidenceRecord[];
      recentEvidence: EvidenceRecord[];
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
      /** Pass-rate history for the trend sparkline (oldest → newest, max 10). */
      trend: Array<{ at: string; passRate: number }>;
    };

/**
 * Index-only open total, memoized per request like the rest of the loaders.
 * The loaded finding rows are capped (see `FINDINGS_LIST_LOAD_LIMIT`), so
 * counts displayed here must come from SQL, not `openFindings.length`.
 */
const countOpenFindings = cache(
  async (projectId: string) =>
    (await countFindingsByStatusForProject(await getDrizzle(), projectId)).open,
);

/**
 * Everything the dashboard renders: scoped runtime rows, status counts,
 * severity-ordered findings, alert/regression/evidence windows, and the
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
  const openCount = await countOpenFindings(project.id);
  const latestAssessment = latestAssessmentFor(runtime.assessments, project.id);
  const requirements = requirementsInScope(runtime.requirements, project);
  const projectFindings = findingsInScope(runtime.findings, project);
  // Severity-first display order (same order as the findings list).
  const openFindings = [...projectFindings].sort(compareFindingsBySeverity);
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
  const recentChanges = latestAssessment?.changesSincePrevious ?? [];

  // Bounded history window, oldest → newest (max 10). runtime.assessments
  // holds the latest assessment only, so the trend reads its own capped
  // history — deriving it from the runtime slice could never reach 2 points.
  const history = await listAssessmentHistoryForProject(
    await getDrizzle(),
    project.id,
    10,
  );
  const trend = history
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1))
    .flatMap((assessment) => {
      const summary = assessment.summary;
      const total = REQUIREMENT_STATUSES.reduce(
        (sum, status) => sum + (summary[status] ?? 0),
        0,
      );
      if (total === 0) return [];
      return [
        {
          at: assessment.completedAt,
          passRate: Math.round(((summary.passed ?? 0) / total) * 100),
        },
      ];
    });

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
          value: openCount,
          href: openCount > 0 ? "/findings" : undefined,
          tone: openCount > 0 ? ("warning" as const) : ("success" as const),
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

  // Single next action, most urgent first: alerts → failed
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
        : openCount > 0
          ? {
              title: `${openCount} open finding${openCount === 1 ? "" : "s"}`,
              description:
                "Triage the queue in severity order — fix each finding to Verified.",
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
    openCount,
    unreadAlerts,
    regressions,
    recentVerified,
    recentEvidence,
    recentChanges,
    quickStats,
    nextAction,
    showFirstRun,
    trend,
  };
}
