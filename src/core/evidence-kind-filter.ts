import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { firstParam } from "./query-param";

export const EVIDENCE_KIND_FILTER_ORDER: readonly EvidenceKind[] = [
  "finding_detected",
  "finding_resolved",
  "finding_dismissed",
  "remediation_verified",
  "remediation_manually_verified",
  "ai_patch_ready",
  "requirement_status_changed",
  "assessment_completed",
  "assessment_job_completed",
  "assessment_job_failed",
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

export function evidenceKindHref(
  kind?: EvidenceKind,
  page?: number,
): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/evidence?${query}` : "/evidence";
}
