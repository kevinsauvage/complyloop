/** Dashboard view loader — data-shaping for the `(app)/dashboard` route (no JSX here). */
import "server-only";

import type { Route } from "next";

import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import { listUnreadAlertsForProject } from "@complyloop/db/repo/alerts";
import { listAssessmentHistoryForProject } from "@complyloop/db/repo/assessments";

import {
  countByStatus,
  hasPreviewUrl,
  latestAssessmentFor,
  passRatePercent,
} from "@/core/assessment/assessment-helpers";
import { findingsListHref } from "@/core/filter-params/findings";
import { requirementsStatusHref } from "@/core/filter-params/requirements";
import { compareFindingsBySeverity } from "@/core/findings/finding-priority";
import { activeRegressions } from "@/core/requirements/active-regressions";
import { navAttentionForProject } from "@/server/reporting/nav-attention";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import {
  findingsInScope,
  requirementsInScope,
} from "@/server/workspace/project-scope";

interface DashboardViewProject {
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
    href?: Route;
    tone:
      "warning" | "success" | "muted" | "signal" | "review" | "unverifiable";
  }>;
  nextAction: {
    title: string;
    description: string;
    cta: string;
    href: Route;
  } | null;
  showFirstRun: boolean;
  /** Pass-rate history for the trend sparkline (oldest → newest, max 10). */
  trend: Array<{ at: string; passRate: number }>;
}

export type DashboardView =
  { project: null; visibleProjects: Project[] } | DashboardViewProject;

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

  const drizzle = await getDrizzle();
  const [runtime, attention, unreadAlerts, history] = await Promise.all([
    getProjectRuntime(project.id, {
      findingStatuses: ["open"],
      // The activity card renders the six most severe; the header count comes
      // from SQL, so loading the rest of the open set buys nothing.
      findingsLimit: 6,
      includeRemediations: false,
      // Unread alerts are loaded directly; read rows are never rendered.
      includeAlerts: false,
    }),
    // Also feeds the shell's nav badges — one cached count for both, since the
    // loaded finding rows are capped and the displayed total must stay exact.
    navAttentionForProject(project),
    listUnreadAlertsForProject(drizzle, project.id),
    // Bounded history window, oldest → newest (max 10). runtime.assessments
    // holds the latest assessment only, so the trend reads its own capped
    // history — deriving it from the runtime slice could never reach 2 points.
    listAssessmentHistoryForProject(drizzle, project.id, 10),
  ]);
  const openCount = attention.openFindings;
  const latestAssessment = latestAssessmentFor(runtime.assessments, project.id);
  const requirements = requirementsInScope(runtime.requirements, project);
  const projectFindings = findingsInScope(runtime.findings, project);
  // Severity-first display order (same order as the findings list).
  const openFindings = [...projectFindings].sort(compareFindingsBySeverity);
  const oldestFirstAlerts = [...unreadAlerts].reverse();
  const regressions = activeRegressions(
    runtime.evidence,
    requirements,
    project.id,
  );
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

  const trend = history
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1))
    .flatMap((assessment) => {
      const passRate = passRatePercent(assessment.summary);
      return passRate === null
        ? []
        : [{ at: assessment.completedAt, passRate }];
    });

  const counts = countByStatus(requirements, REQUIREMENT_STATUSES);

  const failedCount = counts.failed;
  const hasPreviewUrlValue = hasPreviewUrl(project);
  const showFirstRun = !latestAssessment && hasConnectedProject;
  const passRateValue = passRatePercent(counts);
  const passRate = passRateValue === null ? "—" : `${passRateValue}%`;
  const passRateTone =
    passRateValue === null
      ? ("muted" as const)
      : passRateValue >= 90
        ? ("success" as const)
        : passRateValue >= 70
          ? ("signal" as const)
          : ("review" as const);

  // Pass rate leads: it is the one number that answers "how compliant are
  // we?". Unread alerts were dropped — the alerts card below owns them, and
  // a permanent "0" in the strip read as noise.
  const quickStats: DashboardViewProject["quickStats"] = latestAssessment
    ? [
        {
          label: "Pass rate",
          value: passRate,
          tone: passRateTone,
        },
        {
          label: "Open findings",
          value: openCount,
          href: openCount > 0 ? findingsListHref() : undefined,
          tone: openCount > 0 ? ("warning" as const) : ("success" as const),
        },
        {
          label: "Failed requirements",
          value: failedCount,
          href: failedCount > 0 ? requirementsStatusHref("failed") : undefined,
          tone: failedCount > 0 ? ("warning" as const) : ("muted" as const),
        },
        {
          label: "Unable to verify",
          value: counts.unable_to_verify,
          href:
            counts.unable_to_verify > 0
              ? requirementsStatusHref("unable_to_verify")
              : undefined,
          tone:
            counts.unable_to_verify > 0
              ? ("unverifiable" as const)
              : ("muted" as const),
        },
      ]
    : [];

  // Single next action, most urgent first: alerts → failed
  // requirements → open findings → preview-URL coverage gap.
  const nextAction: DashboardViewProject["nextAction"] =
    oldestFirstAlerts.length > 0
      ? {
          title: `${oldestFirstAlerts.length} unread alert${oldestFirstAlerts.length === 1 ? "" : "s"}`,
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
            href: requirementsStatusHref("failed"),
          }
        : openCount > 0
          ? {
              title: `${openCount} open finding${openCount === 1 ? "" : "s"}`,
              description:
                "Triage the queue in severity order — fix each finding to Verified.",
              cta: "Triage findings",
              href: findingsListHref({ tab: "open" }),
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
    unreadAlerts: oldestFirstAlerts,
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
