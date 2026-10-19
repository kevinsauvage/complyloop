import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ExplanationProvenance } from "@complyloop/analysis-core/contract/statuses";

import { AI_EDIT_TEXT_MAX_CHARS, AI_PATH_MAX_CHARS } from "./ai-call";

export interface FileEdit {
  path: string;
  oldText: string;
  newText: string;
}

/**
 * Source-edit shape shared by proposed patches and stored patch details.
 * Length-bounded: these fields are model-authored (and round-trip through
 * evidence payloads), so cap them at the same limits the prompt enforces.
 */
export const fileEditSchema = z.object({
  path: z.string().max(AI_PATH_MAX_CHARS),
  oldText: z.string().max(AI_EDIT_TEXT_MAX_CHARS),
  newText: z.string().max(AI_EDIT_TEXT_MAX_CHARS),
});

export interface ProposedFixEdits {
  description: string;
  provenance: ExplanationProvenance;
  model?: string;
  edits: FileEdit[];
}

export interface ComplyLoopGateResult {
  passed: boolean;
  remaining: string[];
}

export interface PatchCandidate {
  description: string;
  provenance: ExplanationProvenance;
  model?: string;
  edits: FileEdit[];
  complyLoop: ComplyLoopGateResult;
}

/** Evidence `detail` shape for a ready patch (flattened complyLoop fields). */
export const patchCandidateDetailSchema = z.object({
  description: z.string(),
  provenance: z.enum(["ai", "deterministic"]),
  model: z.string().optional(),
  edits: z.array(fileEditSchema).min(1),
  complyLoopPassed: z.literal(true),
  remaining: z.array(z.string()).optional().default([]),
});

export type PatchCandidateDetail = z.infer<typeof patchCandidateDetailSchema>;

export function patchCandidateFromDetail(
  detail: unknown,
): PatchCandidate | null {
  const parsed = patchCandidateDetailSchema.safeParse(detail);
  if (!parsed.success) return null;
  const value = parsed.data;
  return {
    description: value.description,
    provenance: value.provenance,
    ...(value.model ? { model: value.model } : {}),
    edits: value.edits,
    complyLoop: { passed: true, remaining: value.remaining },
  };
}

export function patchCandidateToDetail(
  candidate: PatchCandidate,
): PatchCandidateDetail {
  return patchCandidateDetailSchema.parse({
    description: candidate.description,
    provenance: candidate.provenance,
    ...(candidate.model ? { model: candidate.model } : {}),
    edits: candidate.edits,
    complyLoopPassed: true,
    remaining: candidate.complyLoop.remaining,
  });
}

/** Single-file edit invariant shared by patch proposal and verification. */
export function assertSingleFileEdits(
  edits: ReadonlyArray<FileEdit>,
  targetPath: string,
  opts: { emptyMessage: string; offTargetMessage: (path: string) => string },
): void {
  if (edits.length === 0) {
    throw new PublicError(opts.emptyMessage);
  }
  if (edits.some((edit) => edit.path !== targetPath)) {
    throw new PublicError(opts.offTargetMessage(targetPath));
  }
}
