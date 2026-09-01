import type { Finding } from "./finding-types";
import {
  filterFindings,
  type FilterFindingsContext,
  type FindingListParams,
} from "./finding-list-filter";
import { severityRank } from "./labels";
import { prioritizeFindings } from "./prioritization";
import type { FindingStatus } from "./statuses";

export function orderedFindingIdsForQueue(
  findings: readonly Finding[],
  params: FindingListParams,
  context: FilterFindingsContext,
): string[] {
  if (params.tab === "by_cause") {
    return orderedFindingIdsForStatus(findings, "open", params, context);
  }

  return orderedFindingIdsForStatus(
    findings,
    params.tab,
    params,
    context,
  );
}

function orderedFindingIdsForStatus(
  findings: readonly Finding[],
  status: FindingStatus,
  params: FindingListParams,
  context: FilterFindingsContext,
): string[] {
  const filtered = filterFindings(
    findings.filter((finding) => finding.status === status),
    params,
    context,
  );
  const ordered =
    status === "open"
      ? prioritizeFindings(filtered, context.controls)
      : [...filtered].sort(
          (a, b) => severityRank(a.severity) - severityRank(b.severity),
        );
  return ordered.map((finding) => finding.id);
}

export function findingQueuePosition(
  orderedIds: readonly string[],
  currentId: string,
): {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
} {
  const index = orderedIds.indexOf(currentId);
  if (index === -1) {
    return {
      index: -1,
      total: orderedIds.length,
      prevId: null,
      nextId: null,
    };
  }
  return {
    index,
    total: orderedIds.length,
    prevId: index > 0 ? orderedIds[index - 1]! : null,
    nextId: index < orderedIds.length - 1 ? orderedIds[index + 1]! : null,
  };
}
