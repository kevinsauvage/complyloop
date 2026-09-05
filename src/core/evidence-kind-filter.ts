import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { parseEnumParam, buildHref } from "./query-param";

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
