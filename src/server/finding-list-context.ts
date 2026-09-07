import type {
  FilterFindingsContext,
  FindingListParams,
} from "@/core/finding-list-filter";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import type { FindingCluster } from "@complyloop/db/types";
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
    controls: shippedCatalog().controls,
    remediationStatusFor: (findingId) =>
      findRemediationForFinding(db, findingId)?.status,
    clusterFindingIds,
  };
}
