import type {
  FilterFindingsContext,
  FindingListParams,
} from "@/core/finding-list-filter";
import type { FindingCluster } from "@/core/finding-types";
import type { Db } from "./db";
import { remediationForFinding } from "./workspace";

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
      remediationForFinding(db, findingId).status,
    clusterFindingIds,
  };
}
