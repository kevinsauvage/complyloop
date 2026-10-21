/** Finding detail view loader — data-shaping for the `(app)/findings/[id]` route (no JSX here). */
import "server-only";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { listFindingIdsForQueue } from "@complyloop/db/repo/findings";

import { aiAvailable as isAiAvailable } from "@/ai/ai-call";
import {
  type FilterFindingsContext,
  type FindingListParams,
  findingQueuePosition,
  orderedFindingIdsForQueue,
  parseFindingListParams,
} from "@/core/filter-params/findings";
import type { FindingActView } from "@/core/findings/finding-act";
import { findingAct } from "@/core/findings/finding-act";
import {
  latestPatchState,
  pullRequestUrlFromEvidence,
} from "@/server/assessment/ai-fix";
import { buildDeveloperHandoff } from "@/server/assessment/handoff";
import { listEvidenceForFindingScoped } from "@/server/reporting/evidence-queries";
import { displayControl } from "@/server/reporting/report";
import type { ProjectCapabilities } from "@/server/workspace/project-capabilities";
import { projectCapabilities } from "@/server/workspace/project-capabilities";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import {
  findingsInScope,
  scopedControlIds,
} from "@/server/workspace/project-scope";
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
      queuePosition: ReturnType<typeof findingQueuePosition>;
      listParams: FindingListParams;
      /**
       * True when the stored AI suggestion was generated for a different
       * location than the finding has now (re-scan moved it). The approve
       * step must show this — approving against outdated code is the failure
       * mode. Unknown (unstamped legacy rows) reads as fresh, never stale.
       */
      suggestionStale: boolean;
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

  // Findings without a remediation row (scoped re-assess, stale apply,
  // manual DB edit) render as not-found, like a missing finding — the list
  // page tolerates orphans the same way instead of 500ing. Only PublicError
  // (unknown ids) maps to null; anything else still throws.
  let remediation: Remediation;
  try {
    remediation = await requireRemediationForFinding(finding.id);
  } catch (error) {
    if (error instanceof PublicError) return { finding: null };
    throw error;
  }
  const caps = projectCapabilities(project, access, project.orgId);

  const control = displayControl(finding.controlId, project);
  const [evidence, queueIds] = await Promise.all([
    listEvidenceForFindingScoped(finding.id),
    loadFindingQueueIds(project, listParams),
  ]);
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

  const queuePosition = findingQueuePosition(queueIds, finding.id);

  // Staleness anchor: the latest AI suggestion/patch evidence stamps the
  // location it was generated for. A re-scan that moved the finding leaves
  // the stored suggestion describing old code.
  const suggestionEvidence = [...evidence]
    .reverse()
    .find(
      (record) =>
        (record.kind === "ai_remediation_suggested" ||
          record.kind === "ai_patch_ready") &&
        typeof record.detail?.locationRef === "string",
    );
  const stampedLocation = suggestionEvidence?.detail?.locationRef as
    string | undefined;
  const suggestionStale = Boolean(
    remediation.suggestion &&
    stampedLocation &&
    stampedLocation !== formatLocationRef(finding.location),
  );

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
    queuePosition,
    listParams,
    suggestionStale,
  };
}

/**
 * Ordered finding ids for the prev/next queue of one tab.
 *
 * Ids come straight from SQL (severity-first, same order as the list) with the
 * SQL-expressible filters applied — the page never loads the tab's payloads.
 * Free-text search matches catalog text SQL cannot see, so only that case falls
 * back to the bounded payload load.
 */
async function loadFindingQueueIds(
  project: Project,
  listParams: FindingListParams,
): Promise<string[]> {
  if (listParams.q) {
    const runtime = await getProjectRuntime(project.id, {
      findingStatuses: [listParams.tab],
    });
    const context: FilterFindingsContext = {
      controls: shippedCatalog().controls,
      remediationStatusFor: (findingId) =>
        runtime.remediations.find((row) => row.findingId === findingId)?.status,
    };
    return orderedFindingIdsForQueue(
      findingsInScope(runtime.findings, project),
      listParams,
      context,
    );
  }
  const scoped = scopedControlIds(project);
  return listFindingIdsForQueue(await getDrizzle(), project.id, {
    statuses: [listParams.tab],
    severity: listParams.severity,
    controlId: listParams.control,
    ...(scoped ? { controlIds: [...scoped] } : {}),
    engine: listParams.engine,
    remediation: listParams.remediation,
  });
}
