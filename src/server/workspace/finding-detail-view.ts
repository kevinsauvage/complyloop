/** Finding detail view loader — data-shaping for the finding route (no JSX here). */
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
import { loadProjectPage } from "@/server/workspace/project-page";
import { getProjectRuntime } from "@/server/workspace/project-runtime";
import {
  findingsInScope,
  scopedControlIds,
} from "@/server/workspace/project-scope";
import {
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
 * Everything the finding detail page renders. Returns `{ finding: null }` when
 * the row is missing, has no remediation, or belongs to another project than the
 * URL names — the page then `notFound()`s.
 */
export async function loadFindingDetailView(
  projectId: string,
  findingId: string,
  rawParams: Record<string, string | string[] | undefined>,
): Promise<FindingDetailView> {
  const listParams = parseFindingListParams(rawParams);

  // Three independent lookups: the project page, the finding row, and its
  // remediation (keyed by the route param, not by the finding). Loading them
  // in one wave removes two serial round trips from the drill-down page.
  const [page, finding, remediation] = await Promise.all([
    loadProjectPage(projectId),
    requireFinding(findingId).catch(() => null),
    requireRemediationForFinding(findingId).catch((error: unknown) => {
      if (error instanceof PublicError) return null;
      throw error;
    }),
  ]);
  // Finding ids are global: only the row recorded against the project in the
  // URL may render, so a mismatched pair 404s instead of leaking another
  // project's finding.
  if (!finding || finding.projectId !== projectId || !remediation) {
    return { finding: null };
  }

  const { project, caps } = page;

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
