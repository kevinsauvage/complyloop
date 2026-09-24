/** Requirements view loader — data-shaping for the `(app)/requirements` route (no JSX here). */
import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import {
  defaultConnectPreset,
  isValidPresetId,
  presetById,
  projectDefaultPresetId,
} from "@complyloop/analysis-core/catalog/registry";
import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  countOpenFindingsByControlForProject,
  countsOfOpenFindingsDetectedAfterForControls,
} from "@complyloop/db/repo/findings";

import { countByStatus } from "@/core/assessment/assessment-helpers";
import {
  type PageSlice,
  paginateSlice,
  parsePageParam,
  parsePresetIdParam,
  parseRequirementsQueryParam,
  parseRequirementStatusParam,
} from "@/core/filter-params";
import { stickyDecisionAt } from "@/core/requirements/masked-findings";
import { loadActiveProjectPage } from "@/server/workspace/active-project-page";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";

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
      maskedFindingCounts: Map<string, number>;
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
  // Per-control open counts come from SQL, not the loaded slice: the findings
  // row load is capped, but badges must stay exact.
  const drizzle = await getDrizzle();
  const openFindingCounts = await countOpenFindingsByControlForProject(
    drizzle,
    project.id,
  );
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

  // Sticky human decisions never surface regressions, so count open findings
  // detected after each decision to show the mask on the card.
  const maskedByControlId = new Map<string, number>();
  const stickySince = new Map<string, Date>();
  for (const requirement of assessed) {
    const at = stickyDecisionAt(requirement);
    if (at && (openFindingCounts.get(requirement.controlId) ?? 0) > 0) {
      stickySince.set(requirement.controlId, new Date(at));
    }
  }
  if (stickySince.size > 0) {
    const masked = await countsOfOpenFindingsDetectedAfterForControls(
      drizzle,
      project.id,
      [...stickySince.keys()],
      new Date(Math.min(...[...stickySince.values()].map((d) => d.getTime()))),
    );
    for (const [controlId, detail] of masked) {
      const since = stickySince.get(controlId);
      if (since && detail > 0) maskedByControlId.set(controlId, detail);
    }
  }

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
    maskedFindingCounts: maskedByControlId,
    filtered,
    filteredControls,
    page,
    pageRequirements,
    paginationQuery,
    targetLabel,
  };
}
