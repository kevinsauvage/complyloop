import type {
  EvidenceKind,
  EvidenceRecord,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

import { href } from "./href";
import { firstParam, trimmedQuery } from "./params";
import { requirementsStatusHref } from "./requirements";

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
  const value = firstParam(raw);
  if (!value) return undefined;
  return (EVIDENCE_KIND_FILTER_ORDER as readonly string[]).includes(value)
    ? (value as EvidenceKind)
    : undefined;
}

/** Trimmed evidence search query (summary substring), capped at 100 chars. */
export function parseEvidenceQueryParam(
  raw: string | string[] | undefined,
): string | undefined {
  return trimmedQuery(raw);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict `YYYY-MM-DD` date bound for evidence filtering. Returns undefined
 * for missing, malformed, or non-existent calendar dates (e.g. 2026-02-30)
 * so a typo degrades to "no date filter" instead of an empty page.
 */
export function parseEvidenceDateParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = firstParam(raw);
  if (!value || !ISO_DATE_PATTERN.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return roundTrips ? value : undefined;
}

export interface EvidencePageFilters {
  q?: string;
  from?: string;
  to?: string;
  actor?: string;
}

export function evidenceKindHref(
  kind?: EvidenceKind,
  page?: number,
  filters?: EvidencePageFilters,
): "/evidence" | `/evidence?${string}` {
  return href("/evidence", {
    kind,
    q: filters?.q,
    from: filters?.from,
    to: filters?.to,
    actor: filters?.actor,
    page: page && page > 1 ? String(page) : undefined,
  });
}

export type ReportView = "engineering" | "audit";

export function parseReportViewParam(
  raw: string | null | undefined,
): ReportView {
  if (raw === "engineering") return "engineering";
  return "audit";
}

export type ReportFormat = "markdown" | "html";

export function reportHref(
  view: ReportView,
  format: ReportFormat,
):
  | "/evidence/report"
  | "/evidence/report/html"
  | `/evidence/report?${string}`
  | `/evidence/report/html?${string}` {
  const base = format === "html" ? "/evidence/report/html" : "/evidence/report";
  return href(base, { view });
}

/** Primary navigation target for an evidence row in the compliance loop. */
export function evidenceRecordHref(
  record: EvidenceRecord,
  requirements: readonly Requirement[],
): `/findings/${string}` | `/requirements${string}` | "/dashboard" | undefined {
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
    const target = requirementsStatusHref(requirement?.status);
    return `${target}#${anchor}`;
  }
  if (record.assessmentId) {
    return "/dashboard";
  }
  return undefined;
}
