import type { Finding, FindingCluster } from "@complyloop/db/types";
import {
  engineFor,
  type AssessmentEngine,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { formatLocationRef, locationPathOrUrl } from "@complyloop/analysis-core/contract/location";
import { parsePageParam } from "./pagination";
import { parseEnumParam, firstParam, buildHref } from "./query";
import { prioritizeFindings, severityRank } from "./prioritization";
import {
  REMEDIATION_STATUSES,
  type RemediationStatus,
  type Severity,
  type FindingStatus,
} from "@complyloop/analysis-core/contract/statuses";

const FINDINGS_TABS = [
  "open",
  "resolved",
  "dismissed",
  "by_cause",
] as const;

export type FindingsTab = (typeof FINDINGS_TABS)[number];

const SEVERITIES = [
  "critical",
  "serious",
  "moderate",
  "minor",
] as const satisfies readonly Severity[];

export interface FindingListParams {
  q?: string;
  severity?: Severity;
  engine?: AssessmentEngine;
  remediation?: RemediationStatus;
  control?: string;
  cluster?: string;
  tab: FindingsTab;
  page: number;
}

/** Filter params that are preserved on pagination links (excludes `tab` and `page`). */
export type FindingListFilters = Pick<
  FindingListParams,
  "q" | "severity" | "engine" | "remediation" | "control" | "cluster"
>;

const ENGINE_VALUES = ["ast", "runtime"] as const;

export function parseFindingListParams(
  raw: Record<string, string | string[] | undefined>,
): FindingListParams {
  return {
    q: firstParam(raw.q)?.trim() || undefined,
    severity: parseEnumParam(raw.severity, SEVERITIES) as Severity | undefined,
    engine: parseEnumParam(raw.engine, ENGINE_VALUES) as AssessmentEngine | undefined,
    remediation: parseEnumParam(raw.remediation, REMEDIATION_STATUSES) as RemediationStatus | undefined,
    control: firstParam(raw.control) || undefined,
    cluster: firstParam(raw.cluster) || undefined,
    tab: (parseEnumParam(firstParam(raw.tab), FINDINGS_TABS) as FindingsTab | undefined) ?? "open",
    page: parsePageParam(raw.page),
  };
}

export function hasActiveFindingFilters(
  params: FindingListFilters,
): boolean {
  return Boolean(
    params.q ||
    params.severity ||
    params.engine ||
    params.remediation ||
    params.control ||
    params.cluster,
  );
}

export function findingsListHref(
  params?: Partial<FindingListParams>,
): string {
  const merged: FindingListParams = { tab: "open", page: 1, ...params };
  const query = findingListPaginationQuery(merged);
  if (merged.page > 1) query.page = String(merged.page);
  return buildHref("/findings", query);
}

/** Query params preserved on pagination links (excludes `page`). */
export function findingListPaginationQuery(
  params: FindingListParams,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.severity) query.severity = params.severity;
  if (params.engine) query.engine = params.engine;
  if (params.remediation) query.remediation = params.remediation;
  if (params.control) query.control = params.control;
  if (params.cluster) query.cluster = params.cluster;
  if (params.tab !== "open") query.tab = params.tab;
  return query;
}

export function findingDetailHref(
  findingId: string,
  params: FindingListParams,
): string {
  const query = findingListPaginationQuery(params);
  if (params.page > 1) query.page = String(params.page);
  return buildHref(`/findings/${findingId}`, query);
}

export interface FilterFindingsContext {
  controls: ReadonlyArray<Control>;
  remediationStatusFor: (findingId: string) => RemediationStatus | undefined;
  clusterFindingIds?: ReadonlySet<string>;
  /** Precomputed open-finding clusters; avoids re-clustering when ordering. */
  clusters?: ReadonlyArray<FindingCluster>;
}

export function filterFindings(
  findings: ReadonlyArray<Finding>,
  params: FindingListFilters,
  context: FilterFindingsContext,
): Finding[] {
  let result = [...findings];

  if (params.control) {
    result = result.filter((finding) => finding.controlId === params.control);
  }

  if (params.cluster && context.clusterFindingIds) {
    result = result.filter((finding) =>
      context.clusterFindingIds!.has(finding.id),
    );
  }

  if (params.severity) {
    result = result.filter((finding) => finding.severity === params.severity);
  }

  if (params.engine) {
    result = result.filter(
      (finding) => engineFor(finding) === params.engine,
    );
  }

  if (params.remediation) {
    result = result.filter((finding) => {
      const status = context.remediationStatusFor(finding.id);
      return status === params.remediation;
    });
  }

  if (params.q) {
    const needle = params.q.toLowerCase();
    const controlById = new Map(
      context.controls.map((control) => [control.id, control]),
    );
    result = result.filter((finding) => {
      const control = controlById.get(finding.controlId);
      const path = locationPathOrUrl(finding.location);
      const haystack = [
        control?.code ?? "",
        control?.title ?? "",
        finding.reason,
        formatLocationRef(finding.location),
        path,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  return result;
}

export function orderFindingsForList(
  findings: readonly Finding[],
  status: FindingStatus,
  params: FindingListFilters,
  context: FilterFindingsContext,
): Finding[] {
  const filtered = filterFindings(
    findings.filter((finding) => finding.status === status),
    params,
    context,
  );
  if (status === "open") {
    return prioritizeFindings(filtered, context.controls, context.clusters);
  }
  return [...filtered].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
}

export function orderedFindingIdsForQueue(
  findings: readonly Finding[],
  params: FindingListParams,
  context: FilterFindingsContext,
): string[] {
  const status: FindingStatus =
    params.tab === "by_cause" ? "open" : params.tab;
  return orderFindingsForList(findings, status, params, context).map(
    (finding) => finding.id,
  );
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
