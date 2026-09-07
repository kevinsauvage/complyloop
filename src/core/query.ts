import type { EvidenceRecord, EvidenceKind } from "@complyloop/db/types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

/** First value from a Next.js searchParams entry (string or string[]). */
export function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** Extract a string that must match one of the allowed values. */
export function parseEnumParam(
  raw: string | string[] | undefined,
  allowed: readonly string[],
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return allowed.includes(value) ? value : undefined;
}

/**
 * Builds a `base?key=value…` href from a plain record, omitting the `?`
 * when there are no entries. Values must already be encoded strings.
 */
export function buildHref(
  base: string,
  params: Record<string, string>,
): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}?${qs}` : base;
}

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = parseEnumParam(raw, REQUIREMENT_STATUSES);
  return value as RequirementStatus | undefined;
}

export function requirementsStatusHref(
  status?: RequirementStatus,
): string {
  return buildHref("/requirements", status ? { status } : {});
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
  return parseEnumParam(raw, EVIDENCE_KIND_FILTER_ORDER) as EvidenceKind | undefined;
}

export function evidenceKindHref(
  kind?: EvidenceKind,
  page?: number,
): string {
  const params: Record<string, string> = {};
  if (kind) params.kind = kind;
  if (page && page > 1) params.page = String(page);
  return buildHref("/evidence", params);
}

export type ReportView = "engineering" | "audit";

export function parseReportViewParam(
  raw: string | null | undefined,
): ReportView {
  if (raw === "engineering") return "engineering";
  return "audit";
}

export function reportMarkdownHref(view: ReportView): string {
  return buildHref("/evidence/report", { view });
}

export function reportHtmlHref(view: ReportView): string {
  return buildHref("/evidence/report/html", { view });
}

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  isValidPresetId: (id: string) => boolean,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return isValidPresetId(value) ? value : undefined;
}

/** Preset shown on Requirements: URL override, else project default. */
export function effectiveRequirementsPresetId(
  urlPresetId: string | undefined,
  defaultPresetId: string,
): string {
  return urlPresetId ?? defaultPresetId;
}

export function requirementsPageHref(options: {
  presetId?: string;
  status?: RequirementStatus;
  defaultPresetId: string;
}): string {
  const params: Record<string, string> = {};
  if (options.presetId && options.presetId !== options.defaultPresetId) {
    params.presetId = options.presetId;
  }
  if (options.status) params.status = options.status;
  return buildHref("/requirements", params);
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
    return requirementsStatusHref(requirement?.status);
  }
  if (record.assessmentId) {
    return "/";
  }
  return undefined;
}
