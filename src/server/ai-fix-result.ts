import type { EvidenceRecord } from "@complyloop/analysis-core/contract/finding-types";
import type {
  FileEdit,
  PatchCandidate,
} from "@/ai/verified-fix";

export type PatchUiState =
  | { status: "idle" }
  | { status: "ready"; candidate: PatchCandidate };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEdits(value: unknown): FileEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: FileEdit[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (
      !record ||
      typeof record.path !== "string" ||
      typeof record.oldText !== "string" ||
      typeof record.newText !== "string"
    ) {
      continue;
    }
    edits.push({
      path: record.path,
      oldText: record.oldText,
      newText: record.newText,
    });
  }
  return edits;
}

function parsePatchCandidateDetail(
  detail: Record<string, unknown> | undefined,
): PatchCandidate | null {
  if (
    !detail ||
    typeof detail.description !== "string" ||
    (detail.provenance !== "ai" && detail.provenance !== "deterministic") ||
    detail.complyLoopPassed !== true
  ) {
    return null;
  }
  const edits = parseEdits(detail.edits);
  if (edits.length === 0) return null;
  const remaining = Array.isArray(detail.remaining)
    ? detail.remaining.filter((item): item is string => typeof item === "string")
    : [];
  return {
    description: detail.description,
    provenance: detail.provenance,
    ...(typeof detail.model === "string" ? { model: detail.model } : {}),
    edits,
    complyLoop: { passed: true, remaining },
  };
}

export function patchCandidateDetail(
  candidate: PatchCandidate,
): Record<string, unknown> {
  return {
    description: candidate.description,
    provenance: candidate.provenance,
    ...(candidate.model ? { model: candidate.model } : {}),
    edits: candidate.edits,
    complyLoopPassed: candidate.complyLoop.passed,
    remaining: candidate.complyLoop.remaining,
  };
}

export function patchCandidateFromEvidence(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "summary" | "detail">>,
): PatchCandidate | null {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const record = evidence[index];
    if (!record) continue;
    if (record.kind === "ai_patch_ready") {
      return parsePatchCandidateDetail(record.detail);
    }
  }
  return null;
}

export function latestPatchState(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "summary" | "detail">>,
): PatchUiState {
  const candidate = patchCandidateFromEvidence(evidence);
  return candidate ? { status: "ready", candidate } : { status: "idle" };
}
