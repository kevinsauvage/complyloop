/**
 * Page view loaders — data-shaping for `(app)` routes.
 *
 * Pages stay routing + rendering: they parse params (or receive them), call
 * exactly one loader here, and render. All loader composition (tenancy +
 * runtime + counts + clustering + pagination) lives in these functions so
 * debugging a request starts in one place and "open findings in scope" is
 * derived the same way on every page. No JSX here; components stay in
 * `src/components` / `src/app`.
 */
import "server-only";

import { cache } from "react";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import {
  defaultConnectPreset,
  isValidPresetId,
  presetById,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/catalog/registry";
import type {
  Alert,
  Assessment,
  EvidenceKind,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { DEFAULT_PAGE_SIZE } from "@complyloop/analysis-core/contract/project-types";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import { countFindingsByStatusForProject } from "@complyloop/db/repo/findings";

import { aiAvailable as isAiAvailable } from "@/ai/ai-call";
import {
  countByStatus,
  latestAssessmentFor,
  toCountMap,
} from "@/core/assessment-helpers";
import {
  type FilterFindingsContext,
  findingListPaginationQuery,
  type FindingListParams,
  findingQueuePosition,
  type FindingsTab,
  hasActiveFindingFilters,
  orderedFindingIdsForQueue,
  orderFindingsForList,
  type PageSlice,
  pageSliceFromQuery,
  paginateSlice,
  parseEvidenceDateParam,
  parseEvidenceKindParam,
  parseEvidenceQueryParam,
  parseFindingListParams,
  parsePageParam,
  parsePresetIdParam,
  parseRequirementsQueryParam,
  parseRequirementStatusParam,
} from "@/core/filter-params";
import type { FindingActView } from "@/core/finding-act";
import { findingAct } from "@/core/finding-act";
import {
  clusterFindings,
  prioritizeClusters,
  prioritizeFindings,
} from "@/core/finding-priority";
import {
  latestPatchState,
  pullRequestUrlFromEvidence,
} from "@/server/assessment/ai-fix";
import { buildDeveloperHandoff } from "@/server/assessment/handoff";
import {
  listEvidenceForFindingScoped,
  loadEvidencePage,
} from "@/server/reporting/evidence-queries";
import { displayControl } from "@/server/reporting/report";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { projectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import {
  findingsInScope,
  requirementsInScope,
} from "@/server/workspace/project-scope";
import { isProjectVisible } from "@/server/workspace/project-visibility";
import {
  getWorkspace,
  requireFinding,
  requireRemediationForFinding,
} from "@/server/workspace/workspace";

export type FindingsView =
  | { project: null }
  | {
      project: Project;
      caps: ProjectCapabilities;
      listParams: FindingListParams;
      activeTab: FindingsTab;
      statusCounts: { open: number; resolved: number; dismissed: number };
      totalFindings: number;
      openSlice: PageSlice<Finding>;
      resolvedSlice: PageSlice<Finding>;
      dismissedSlice: PageSlice<Finding>;
      clusters: ReturnType<typeof prioritizeClusters>;
      findings: Finding[];
      controls: readonly Control[];
      remediationByFindingId: Map<string, Remediation>;
      paginationQuery: Record<string, string>;
      filtersActive: boolean;
      hasAssessment: boolean;
    };

/**
 * Index-only tab totals, memoized per request like the rest of the loaders.
 */
const countFindingsByStatus = cache(async (projectId: string) =>
  countFindingsByStatusForProject(await getDrizzle(), projectId),
);

/**
 * Everything the findings list page renders, derived in one place: tab
 * totals (index-only count), scoped runtime rows, clusters, filter context,
 * ordered + paginated slices. Item mapping (`toFindingListItems`) stays in
 * the page next to its component imports.
 */
export async function loadFindingsView(
  rawParams: Record<string, string | string[] | undefined>,
): Promise<FindingsView> {
  const listParams = parseFindingListParams(rawParams);
  const { project, caps } = await loadActiveProjectPage();
  if (!project) return { project: null };

  // Never rewrite the requested tab: a shared or bookmarked ?tab=open link
  // must render the open list (or its empty state), not silently jump to
  // another status.
  const activeTab: FindingsTab = listParams.tab;
  const statusForTab: FindingStatus =
    activeTab === "by_cause" ? "open" : activeTab;

  // Tab totals come from an index-only count so inherited history never inflates
  // the payload. Only open findings plus the active status load in full:
  // dashboard/requirements/finding pages only need open findings, and resolved
  // or dismissed rows are fetched only when their tab is actually viewed.
  const statusCounts = await countFindingsByStatus(project.id);
  const totalFindings =
    statusCounts.open + statusCounts.resolved + statusCounts.dismissed;
  const findingStatuses: FindingStatus[] =
    statusForTab === "open" ? ["open"] : ["open", statusForTab];

  const runtime = await getProjectRuntime(project.id, { findingStatuses });
  const findings = findingsInScope(runtime.findings, project);
  const remediationByFindingId = new Map(
    runtime.remediations.map((remediation) => [
      remediation.findingId,
      remediation,
    ]),
  );
  const controls = shippedCatalog().controls;
  const rawClusters = clusterFindings(findings, controls);
  const clusters = prioritizeClusters(findings, controls, rawClusters);
  const filterContext: FilterFindingsContext = {
    controls,
    remediationStatusFor: (findingId) =>
      remediationByFindingId.get(findingId)?.status,
    clusterFindingIds: listParams.cluster
      ? new Set(
          clusters.find((cluster) => cluster.id === listParams.cluster)
            ?.findingIds ?? [],
        )
      : undefined,
    clusters: rawClusters,
  };

  const byStatus = (status: FindingStatus): Finding[] =>
    orderFindingsForList(findings, status, listParams, filterContext);

  const openSlice = paginateSlice(byStatus("open"), listParams.page);
  // Inactive history tabs use the SQL count for their badge; their rows load
  // only when the tab is active, so the slice is intentionally empty.
  const resolvedSlice = findingStatuses.includes("resolved")
    ? paginateSlice(byStatus("resolved"), listParams.page)
    : pageSliceFromQuery<Finding>([], listParams.page, statusCounts.resolved);
  const dismissedSlice = findingStatuses.includes("dismissed")
    ? paginateSlice(byStatus("dismissed"), listParams.page)
    : pageSliceFromQuery<Finding>([], listParams.page, statusCounts.dismissed);
  const paginationQuery = findingListPaginationQuery(listParams);

  const hasAssessment = runtime.assessments.some(
    (assessment) => assessment.projectId === project.id,
  );

  return {
    project,
    caps,
    listParams,
    activeTab,
    statusCounts,
    totalFindings,
    openSlice,
    resolvedSlice,
    dismissedSlice,
    clusters,
    findings,
    controls,
    remediationByFindingId,
    paginationQuery,
    filtersActive: hasActiveFindingFilters(listParams),
    hasAssessment,
  };
}

export type FindingDetailView =
  | { finding: null }
  | {
      finding: Finding;
      project: Project;
      caps: ProjectCapabilities;
      remediation: Remediation;
      control: ReturnType<typeof displayControl>;
      chronologicalEvidence: EvidenceRecord[];
      evidence: EvidenceRecord[];
      prUrl: string | null;
      patchState: ReturnType<typeof latestPatchState>;
      aiAvailable: boolean;
      act: FindingActView;
      handoff: ReturnType<typeof buildDeveloperHandoff> | null;
      queueIds: string[];
      queuePosition: ReturnType<typeof findingQueuePosition>;
      listParams: FindingListParams;
    };

/**
 * Everything the finding detail page renders. Returns `{ finding: null }`
 * when the row is missing or invisible so the page can `notFound()`.
 */
export async function loadFindingDetailView(
  id: string,
  rawParams: Record<string, string | string[] | undefined>,
): Promise<FindingDetailView> {
  const listParams = parseFindingListParams(rawParams);
  const { access, projects } = await getWorkspace();
  let finding: Finding;
  try {
    finding = await requireFinding(id);
  } catch {
    return { finding: null };
  }
  const project = projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project || !isProjectVisible(project, access)) {
    return { finding: null };
  }

  const statusForTab = listParams.tab === "by_cause" ? "open" : listParams.tab;
  const [runtime, remediation] = await Promise.all([
    getProjectRuntime(project.id, { findingStatuses: [statusForTab] }),
    requireRemediationForFinding(finding.id),
  ]);
  const remediationByFindingId = new Map(
    runtime.remediations.map((row) => [row.findingId, row]),
  );
  const caps = projectCapabilities(project, access, project.orgId);

  const control = displayControl(finding.controlId, project);
  const evidence = await listEvidenceForFindingScoped(finding.id);
  const chronologicalEvidence = [...evidence].reverse();
  const aiAvailable = isAiAvailable();
  const prUrl = pullRequestUrlFromEvidence(chronologicalEvidence);
  const patchState = latestPatchState(chronologicalEvidence);
  const githubConnected = Boolean(project.github?.fullName);
  const act = findingAct({
    finding,
    remediation,
    canRemediate: caps.canRemediate,
    prUrl,
    aiAvailable,
    patchReady: patchState.status === "ready",
    githubConnected,
  });
  const handoff = act.showHandoff
    ? buildDeveloperHandoff(project, control, finding, remediation)
    : null;

  const scopedFindings = findingsInScope(runtime.findings, project);
  const controls = shippedCatalog().controls;
  const rawClusters = clusterFindings(scopedFindings, controls);
  const clusters = prioritizeClusters(scopedFindings, controls, rawClusters);
  const queueFilterContext: FilterFindingsContext = {
    controls,
    remediationStatusFor: (findingId) =>
      remediationByFindingId.get(findingId)?.status,
    clusterFindingIds: listParams.cluster
      ? new Set(
          clusters.find((cluster) => cluster.id === listParams.cluster)
            ?.findingIds ?? [],
        )
      : undefined,
    clusters: rawClusters,
  };

  const queueIds = orderedFindingIdsForQueue(
    scopedFindings,
    listParams,
    queueFilterContext,
  );
  const queuePosition = findingQueuePosition(queueIds, finding.id);

  return {
    finding,
    project,
    caps,
    remediation,
    control,
    chronologicalEvidence,
    evidence,
    prUrl,
    patchState,
    aiAvailable,
    act,
    handoff,
    queueIds,
    queuePosition,
    listParams,
  };
}

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
  const hasPreviewUrl = Boolean(project.runtimeBaseUrl?.trim());
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
          : counts.unable_to_verify > 0 && !hasPreviewUrl
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

export type EvidenceView =
  | { project: null }
  | {
      project: Project;
      kindFilter: ReturnType<typeof parseEvidenceKindParam>;
      query: string | undefined;
      from: string | undefined;
      to: string | undefined;
      actor: string | undefined;
      filters: {
        q: string | undefined;
        from: string | undefined;
        to: string | undefined;
        actor: string | undefined;
      };
      page: number;
      requirements: Requirement[];
      kindCounts: Map<EvidenceKind, number>;
      items: EvidenceRecord[];
      filteredTotal: number | null;
      totalUnfiltered: number;
      total: number;
      slice: PageSlice<EvidenceRecord>;
      paginationQuery: Record<string, string>;
      filtersActive: boolean;
    };

/**
 * Everything the evidence page renders: parsed filters, the evidence window
 * query, and totals derived without extra `count(*)` scans.
 */
export async function loadEvidenceView(
  rawParams: Record<string, string | string[] | undefined>,
): Promise<EvidenceView> {
  const {
    page: pageRaw,
    kind: kindRaw,
    q: qRaw,
    from: fromRaw,
    to: toRaw,
    actor: actorRaw,
  } = rawParams;
  const { project } = await loadActiveProjectPage();
  if (!project) return { project: null };

  const kindFilter = parseEvidenceKindParam(kindRaw);
  const query = parseEvidenceQueryParam(qRaw);
  const from = parseEvidenceDateParam(fromRaw);
  const to = parseEvidenceDateParam(toRaw);
  const actor = parseEvidenceQueryParam(actorRaw);
  const filters = { q: query, from, to, actor };
  const hasTextOrDateFilter =
    query !== undefined ||
    from !== undefined ||
    to !== undefined ||
    actor !== undefined;
  const page = parsePageParam(pageRaw);
  const { requirements, kindCounts, items, filteredTotal } =
    await loadEvidencePage(
      project.id,
      page,
      DEFAULT_PAGE_SIZE,
      { kind: kindFilter, ...filters },
      hasTextOrDateFilter,
    );
  // The unfiltered total is the sum of the per-kind counts; the kind-only
  // total is one bucket — no extra count(*) scans needed.
  const totalUnfiltered = [...kindCounts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const total =
    filteredTotal ??
    (kindFilter ? (kindCounts.get(kindFilter) ?? 0) : totalUnfiltered);
  const slice = pageSliceFromQuery(items, page, total);
  const paginationQuery: Record<string, string> = {};
  if (kindFilter) paginationQuery.kind = kindFilter;
  if (query) paginationQuery.q = query;
  if (from) paginationQuery.from = from;
  if (to) paginationQuery.to = to;
  if (actor) paginationQuery.actor = actor;
  const filtersActive = kindFilter !== undefined || hasTextOrDateFilter;

  return {
    project,
    kindFilter,
    query,
    from,
    to,
    actor,
    filters,
    page,
    requirements,
    kindCounts,
    items,
    filteredTotal,
    totalUnfiltered,
    total,
    slice,
    paginationQuery,
    filtersActive,
  };
}

function controlsForPreset(
  controls: readonly Control[],
  presetId: string,
): Control[] {
  const preset = presetById(presetId);
  if (!preset) return [];
  const ids = new Set(preset.controlIds);
  return controls.filter((control) => ids.has(control.id));
}

export type RequirementsView =
  | { project: null }
  | {
      project: Project;
      caps: ProjectCapabilities;
      statusFilter: ReturnType<typeof parseRequirementStatusParam>;
      query: string | undefined;
      defaultPresetId: string;
      selectedPresetId: string;
      selectedPreset: ReturnType<typeof presetById>;
      frameworkId: string;
      assessed: Requirement[];
      statusCounts: Record<(typeof REQUIREMENT_STATUSES)[number], number>;
      openFindingCounts: Map<string, number>;
      filtered: Requirement[];
      filteredControls: Control[];
      page: PageSlice<Control>;
      pageRequirements: Requirement[];
      paginationQuery: Record<string, string>;
      targetLabel: string;
    };

/**
 * Everything the requirements page renders: preset resolution, scoped +
 * filtered requirements, per-control open-finding counts, and pagination.
 */
export async function loadRequirementsView(
  rawParams: Record<string, string | string[] | undefined>,
): Promise<RequirementsView> {
  const statusFilter = parseRequirementStatusParam(rawParams.status);
  const query = parseRequirementsQueryParam(rawParams.q);
  const urlPresetId = parsePresetIdParam(rawParams.presetId, isValidPresetId);
  const { project, caps } = await loadActiveProjectPage();
  if (!project) return { project: null };

  const runtime = await getProjectRuntime(project.id, {
    findingStatuses: ["open"],
  });
  const defaultPresetId = projectDefaultPresetId(project);
  const selectedPresetId = urlPresetId ?? defaultPresetId;
  const selectedPreset = presetById(selectedPresetId);
  const frameworkId =
    selectedPreset?.frameworkId ?? defaultConnectPreset().frameworkId;

  const requirements = runtime.requirements.filter(
    (requirement) => requirement.projectId === project.id,
  );
  const presetControls = controlsForPreset(
    shippedCatalog().controls,
    selectedPresetId,
  );
  const inScopeIds = new Set(presetControls.map((control) => control.id));
  const assessed = requirements.filter((requirement) =>
    inScopeIds.has(requirement.controlId),
  );

  const openFindingCounts = toCountMap(
    runtime.findings.filter(
      (finding) =>
        finding.projectId === project.id && finding.status === "open",
    ),
    (finding) => finding.controlId,
  );

  const statusCounts = countByStatus(assessed, REQUIREMENT_STATUSES);

  const filtered = statusFilter
    ? assessed.filter((requirement) => requirement.status === statusFilter)
    : assessed;
  const filteredControlIds = new Set(
    filtered.map((requirement) => requirement.controlId),
  );
  const statusControls = presetControls.filter((control) =>
    filteredControlIds.has(control.id),
  );
  const needle = query?.toLowerCase();
  const filteredControls = needle
    ? statusControls.filter((control) =>
        `${control.code} ${control.title}`.toLowerCase().includes(needle),
      )
    : statusControls;

  const page = paginateSlice(
    filteredControls,
    parsePageParam(rawParams.page),
    25,
  );
  const pageControlIds = new Set(page.items.map((control) => control.id));
  const pageRequirements = filtered.filter((requirement) =>
    pageControlIds.has(requirement.controlId),
  );

  const paginationQuery: Record<string, string> = {};
  if (statusFilter) paginationQuery.status = statusFilter;
  if (query) paginationQuery.q = query;
  if (selectedPresetId !== defaultPresetId) {
    paginationQuery.presetId = selectedPresetId;
  }

  const targetLabel = selectedPreset?.name ?? "all catalog controls";

  return {
    project,
    caps,
    statusFilter,
    query,
    defaultPresetId,
    selectedPresetId,
    selectedPreset,
    frameworkId,
    assessed,
    statusCounts,
    openFindingCounts,
    filtered,
    filteredControls,
    page,
    pageRequirements,
    paginationQuery,
    targetLabel,
  };
}
