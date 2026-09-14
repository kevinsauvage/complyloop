import type { Finding } from "@complyloop/analysis-core/contract/entities";
import {
  type AssessmentEngine,
  engineFor,
} from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  locationPathOrUrl,
} from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import {
  type FindingStatus,
  REMEDIATION_STATUSES,
  type RemediationStatus,
  type Severity,
} from "@complyloop/analysis-core/contract/statuses";

import type { FindingCluster } from "../finding-priority";
import {
  prioritizeFindings,
  SEVERITY_ORDER,
  severityRank,
} from "../finding-priority";
import { parsePageParam } from "./pagination";

const FINDINGS_TABS = ["open", "resolved", "dismissed", "by_cause"] as const;

export type FindingsTab = (typeof FINDINGS_TABS)[number];

const SEVERITIES = SEVERITY_ORDER;

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
  const q = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const severity = Array.isArray(raw.severity) ? raw.severity[0] : raw.severity;
  const engine = Array.isArray(raw.engine) ? raw.engine[0] : raw.engine;
  const remediation = Array.isArray(raw.remediation)
    ? raw.remediation[0]
    : raw.remediation;
  const control = Array.isArray(raw.control) ? raw.control[0] : raw.control;
  const cluster = Array.isArray(raw.cluster) ? raw.cluster[0] : raw.cluster;
  const tab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  return {
    q: q?.trim() || undefined,
    severity: (SEVERITIES as readonly string[]).includes(severity ?? "")
      ? (severity as Severity)
      : undefined,
    engine: (ENGINE_VALUES as readonly string[]).includes(engine ?? "")
      ? (engine as AssessmentEngine)
      : undefined,
    remediation: (REMEDIATION_STATUSES as readonly string[]).includes(
      remediation ?? "",
    )
      ? (remediation as RemediationStatus)
      : undefined,
    control: control || undefined,
    cluster: cluster || undefined,
    tab: (FINDINGS_TABS as readonly string[]).includes(tab ?? "")
      ? (tab as FindingsTab)
      : "open",
    page: parsePageParam(raw.page),
  };
}

export function hasActiveFindingFilters(params: FindingListFilters): boolean {
  return Boolean(
    params.q ||
      params.severity ||
      params.engine ||
      params.remediation ||
      params.control ||
      params.cluster,
  );
}

export function findingsListHref(params?: Partial<FindingListParams>): string {
  const merged: FindingListParams = { tab: "open", page: 1, ...params };
  const qs = new URLSearchParams(findingListQueryWithPage(merged)).toString();
  return qs ? `/findings?${qs}` : "/findings";
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

/** Pagination query plus `page` when beyond the first page. */
function findingListQueryWithPage(
  params: FindingListParams,
): Record<string, string> {
  const query = findingListPaginationQuery(params);
  if (params.page > 1) query.page = String(params.page);
  return query;
}

export function findingDetailHref(
  findingId: string,
  params: FindingListParams,
): string {
  const qs = new URLSearchParams(findingListQueryWithPage(params)).toString();
  const base = `/findings/${findingId}`;
  return qs ? `${base}?${qs}` : base;
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
    result = result.filter((finding) => engineFor(finding) === params.engine);
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
  const status: FindingStatus = params.tab === "by_cause" ? "open" : params.tab;
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
