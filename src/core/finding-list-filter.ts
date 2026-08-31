import type { AssessmentEngine, Finding } from "./finding-types";
import type { Control } from "./project-types";
import { formatLocationRef } from "./location";
import { parsePageParam } from "./pagination";
import {
  REMEDIATION_STATUSES,
  type RemediationStatus,
  type Severity,
} from "./statuses";

export const FINDINGS_TABS = [
  "open",
  "resolved",
  "dismissed",
  "by_cause",
] as const;

export type FindingsTab = (typeof FINDINGS_TABS)[number];

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

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

export function parseFindingsTab(
  raw: string | undefined,
): FindingsTab | undefined {
  if (
    raw === "open" ||
    raw === "resolved" ||
    raw === "dismissed" ||
    raw === "by_cause"
  ) {
    return raw;
  }
  return undefined;
}

function parseSeverityParam(
  raw: string | string[] | undefined,
): Severity | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return (SEVERITIES as readonly string[]).includes(value)
    ? (value as Severity)
    : undefined;
}

function parseEngineParam(
  raw: string | string[] | undefined,
): AssessmentEngine | undefined {
  const value = firstParam(raw);
  if (value === "ast" || value === "runtime") return value;
  return undefined;
}

function parseRemediationParam(
  raw: string | string[] | undefined,
): RemediationStatus | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return (REMEDIATION_STATUSES as readonly string[]).includes(value)
    ? (value as RemediationStatus)
    : undefined;
}

export function parseFindingListParams(
  raw: Record<string, string | string[] | undefined>,
): FindingListParams {
  return {
    q: firstParam(raw.q)?.trim() || undefined,
    severity: parseSeverityParam(raw.severity),
    engine: parseEngineParam(raw.engine),
    remediation: parseRemediationParam(raw.remediation),
    control: firstParam(raw.control) || undefined,
    cluster: firstParam(raw.cluster) || undefined,
    tab: parseFindingsTab(firstParam(raw.tab)) ?? "open",
    page: parsePageParam(raw.page),
  };
}

export function hasActiveFindingFilters(
  params: Pick<
    FindingListParams,
    "q" | "severity" | "engine" | "remediation" | "control" | "cluster"
  >,
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
  const merged: FindingListParams = {
    tab: "open",
    page: 1,
    ...params,
  };
  const search = new URLSearchParams();
  if (merged.q) search.set("q", merged.q);
  if (merged.severity) search.set("severity", merged.severity);
  if (merged.engine) search.set("engine", merged.engine);
  if (merged.remediation) search.set("remediation", merged.remediation);
  if (merged.control) search.set("control", merged.control);
  if (merged.cluster) search.set("cluster", merged.cluster);
  if (merged.tab !== "open") search.set("tab", merged.tab);
  if (merged.page > 1) search.set("page", String(merged.page));
  const qs = search.toString();
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

export function findingDetailHref(
  findingId: string,
  params: FindingListParams,
): string {
  const search = new URLSearchParams(findingListPaginationQuery(params));
  if (params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/findings/${findingId}?${qs}` : `/findings/${findingId}`;
}

export interface FilterFindingsContext {
  controls: ReadonlyArray<Control>;
  remediationStatusFor: (findingId: string) => RemediationStatus | undefined;
  clusterFindingIds?: ReadonlySet<string>;
}

export function filterFindings(
  findings: ReadonlyArray<Finding>,
  params: Pick<
    FindingListParams,
    "q" | "severity" | "engine" | "remediation" | "control" | "cluster"
  >,
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
      (finding) => (finding.engine ?? "ast") === params.engine,
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
      const path =
        finding.location.kind === "source"
          ? finding.location.filePath
          : finding.location.url;
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
