/**
 * Finding detail view loader — data-shaping for the `(app)/findings/[id]` route.
 *
 * Split from the former `project-view.ts` god-loader: one loader module per
 * route. Pages stay routing + rendering: they parse params, call exactly one
 * loader here, and render. No JSX here.
 */
import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { aiAvailable as isAiAvailable } from "@/ai/ai-call";
import {
  type FilterFindingsContext,
  type FindingListParams,
  findingQueuePosition,
  orderedFindingIdsForQueue,
  parseFindingListParams,
} from "@/core/filter-params";
import type { FindingActView } from "@/core/finding-act";
import { findingAct } from "@/core/finding-act";
import {
  clusterFindings,
  prioritizeClusters,
} from "@/core/finding-priority";
import {
  latestPatchState,
  pullRequestUrlFromEvidence,
} from "@/server/assessment/ai-fix";
import { buildDeveloperHandoff } from "@/server/assessment/handoff";
import {
  listEvidenceForFindingScoped,
} from "@/server/reporting/evidence-queries";
import { displayControl } from "@/server/reporting/report";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { projectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import { findingsInScope } from "@/server/workspace/project-scope";
import { isProjectVisible } from "@/server/workspace/project-visibility";
import {
  getWorkspace,
  requireFinding,
  requireRemediationForFinding,
} from "@/server/workspace/workspace";

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
