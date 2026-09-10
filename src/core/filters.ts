import { z } from "zod";
import type {
  EvidenceKind,
  EvidenceRecord,
  Finding,
  FindingCluster,
} from "@complyloop/db/types";
import {
  DEFAULT_PAGE_SIZE,
  type Control,
  type Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  engineFor,
  type AssessmentEngine,
} from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  locationPathOrUrl,
} from "@complyloop/analysis-core/contract/location";
import {
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUSES,
  type FindingStatus,
  type RemediationStatus,
  type RequirementStatus,
  type Severity,
} from "@complyloop/analysis-core/contract/statuses";
import {
  prioritizeFindings,
  SEVERITY_ORDER,
  severityRank,
} from "./lifecycle";

export { DEFAULT_PAGE_SIZE };

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value)
    ? (value as RequirementStatus)
    : undefined;
}

export function requirementsStatusHref(
  status?: RequirementStatus,
): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `/requirements?${qs}` : "/requirements";
}

/**
 * Evidence-page filter chips — a deliberately short allow-list of general
 * kinds. Do not grow it with every `EvidenceKind`: new events reuse a general
 * kind with a `detail` discriminant, so the chips stay few. Kinds that share
 * a general parent (e.g. the requirement exception / human-pass noun-pairs)
 * intentionally have no chip of their own.
 */
export const EVIDENCE_KIND_FILTER_ORDER: readonly EvidenceKind[] = [
  "finding",
  "remediation_verified",
  "remediation_manually_verified",
  "ai_patch_ready",
  "requirement_status_changed",
  "assessment_completed",
  "assessment_job",
] as const;

export function parseEvidenceKindParam(
  raw: string | string[] | undefined,
): EvidenceKind | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return (EVIDENCE_KIND_FILTER_ORDER as readonly string[]).includes(value)
    ? (value as EvidenceKind)
    : undefined;
}

export function evidenceKindHref(
  kind?: EvidenceKind,
  page?: number,
): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/evidence?${qs}` : "/evidence";
}

export type ReportView = "engineering" | "audit";

export function parseReportViewParam(
  raw: string | null | undefined,
): ReportView {
  if (raw === "engineering") return "engineering";
  return "audit";
}

export type ReportFormat = "markdown" | "html";

export function reportHref(view: ReportView, format: ReportFormat): string {
  const base = format === "html" ? "/evidence/report/html" : "/evidence/report";
  return `${base}?${new URLSearchParams({ view }).toString()}`;
}

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  isValidPresetId: (id: string) => boolean,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return isValidPresetId(value) ? value : undefined;
}

export function requirementsPageHref(options: {
  presetId?: string;
  status?: RequirementStatus;
  defaultPresetId: string;
}): string {
  const params = new URLSearchParams();
  if (options.presetId && options.presetId !== options.defaultPresetId) {
    params.set("presetId", options.presetId);
  }
  if (options.status) params.set("status", options.status);
  const qs = params.toString();
  return qs ? `/requirements?${qs}` : "/requirements";
}

/** Primary navigation target for an evidence row in the compliance loop. */
export function evidenceRecordHref(
  record: EvidenceRecord,
  requirements: readonly Requirement[],
): string | undefined {
  if (record.findingId) {
    return `/findings/${record.findingId}`;
  }
  if (record.controlId) {
    const requirement = requirements.find(
      (candidate) => candidate.controlId === record.controlId,
    );
    // Preserve the requirement anchor so the link lands on the card, not
    // just the filtered list.
    const anchor = `requirement-${record.controlId}`;
    const href = requirementsStatusHref(requirement?.status);
    return `${href}#${anchor}`;
  }
  if (record.assessmentId) {
    return "/";
  }
  return undefined;
}

export function parsePageParam(
  raw: string | string[] | undefined,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

function pageMeta(
  page: number,
  total: number,
  pageSize: number,
): Omit<PageSlice<unknown>, "items"> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    page: currentPage,
    pageSize,
    total,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageSlice<T> {
  const meta = pageMeta(page, items.length, pageSize);
  const start = (meta.page - 1) * pageSize;
  return {
    ...meta,
    items: items.slice(start, start + pageSize),
  };
}

/** Build a page slice when items were already fetched for `page` (SQL LIMIT/OFFSET). */
export function pageSliceFromQuery<T>(
  items: readonly T[],
  page: number,
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageSlice<T> {
  return {
    ...pageMeta(page, total, pageSize),
    items: [...items],
  };
}

const FINDINGS_TABS = [
  "open",
  "resolved",
  "dismissed",
  "by_cause",
] as const;

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

export const entityIdSchema = z.string().trim().min(1).max(128);

export const optionalNoteSchema = z
  .string()
  .max(2000)
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  });

export function requiredField(message: string, max = 128) {
  return z
    .string({ error: message })
    .trim()
    .min(1, { error: message })
    .max(max, { error: message });
}

export function findingIdsField(emptyMessage: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value == null) return [];
      const ids = (Array.isArray(value) ? value : [value])
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      return [...new Set(ids)];
    })
    .pipe(z.array(entityIdSchema).min(1, { error: emptyMessage }));
}

const githubRepoSummarySchema = z.object({
  fullName: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  private: z.boolean(),
  defaultBranch: z.string().min(1),
  updatedAt: z.string(),
  htmlUrl: z.string().min(1),
  cloneUrl: z.string().min(1),
  installationId: z.number().int().positive().optional(),
});

export const githubRepoSearchResponseSchema = z.object({
  repos: z.array(githubRepoSummarySchema),
  hasMore: z.boolean(),
  error: z.string().optional(),
});

export function formRecord(
  formData: FormData,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string");
    const [first, ...rest] = values;
    if (first != null && rest.length === 0) {
      record[key] = first;
    } else if (rest.length > 0) {
      record[key] = values;
    }
  }
  return record;
}

export function firstIssueMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

export function parseUnknown<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

export function parseForm<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  fallback = "Invalid form input.",
): T {
  const result = schema.safeParse(formRecord(formData));
  if (!result.success) {
    throw new PublicError(firstIssueMessage(result.error, fallback), "validation");
  }
  return result.data;
}

export function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback = "Invalid input.",
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new PublicError(firstIssueMessage(result.error, fallback), "validation");
  }
  return result.data;
}
