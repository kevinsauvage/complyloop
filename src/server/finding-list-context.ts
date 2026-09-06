import type {
  FilterFindingsContext,
  FindingListParams,
} from "@/core/finding-list-filter";
import type { FindingCluster } from "@complyloop/analysis-core/contract/finding-types";
import type { Db } from "./db";
import { findRemediationForFinding } from "./workspace";

export function buildFindingFilterContext(
  db: Db,
  listParams: Pick<FindingListParams, "cluster">,
  clusters: ReadonlyArray<Pick<FindingCluster, "id" | "findingIds">>,
): FilterFindingsContext {
  const clusterFindingIds = listParams.cluster
    ? new Set(
        clusters.find((cluster) => cluster.id === listParams.cluster)
          ?.findingIds ?? [],
      )
    : undefined;

  return {
    controls: db.controls,
    remediationStatusFor: (findingId) =>
      findRemediationForFinding(db, findingId)?.status,
    clusterFindingIds,
  };
}
