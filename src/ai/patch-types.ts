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

/** Lines of unchanged context kept on each side of a bounded edit. */
const DEFAULT_EDIT_CONTEXT_LINES = 3;
/** Above this size a window is no longer a "bounded diff" worth storing. */
const DEFAULT_EDIT_MAX_CHARS = 8_000;

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Narrows a whole-file replacement to the smallest search/replace window that
 * still matches exactly once, keeping a few lines of context on each side.
 *
 * Deterministic fixes used to emit the entire file as `oldText`/`newText`, and
 * a ready patch is stored in append-only evidence — a secret anywhere in the
 * file would then be unremovable. The window keeps apply semantics intact
 * (unique match) while storing only the changed region.
 *
 * Falls back to the full text when no unique window fits the budget, so a
 * patch is never made unappliable by this optimisation.
 */
export function boundFileEdit(
  path: string,
  original: string,
  updated: string,
  options: { contextLines?: number; maxChars?: number } = {},
): FileEdit {
  const full: FileEdit = { path, oldText: original, newText: updated };
  if (original === updated) return full;
  const contextLines = options.contextLines ?? DEFAULT_EDIT_CONTEXT_LINES;
  const maxChars = options.maxChars ?? DEFAULT_EDIT_MAX_CHARS;

  const originalLines = original.split("\n");
  const updatedLines = updated.split("\n");

  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < updatedLines.length &&
    originalLines[prefix] === updatedLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < originalLines.length - prefix &&
    suffix < updatedLines.length - prefix &&
    originalLines[originalLines.length - 1 - suffix] ===
      updatedLines[updatedLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  for (let context = contextLines; ; context *= 2) {
    const start = Math.max(0, prefix - context);
    const oldEnd = Math.min(
      originalLines.length,
      originalLines.length - suffix + context,
    );
    const newEnd = Math.min(
      updatedLines.length,
      updatedLines.length - suffix + context,
    );
    const oldText = originalLines.slice(start, oldEnd).join("\n");
    const newText = updatedLines.slice(start, newEnd).join("\n");
    if (
      oldText.length <= maxChars &&
      countOccurrences(original, oldText) === 1
    ) {
      return { path, oldText, newText };
    }
    // Nothing left to expand: no bounded unique window exists.
    if (start === 0 && oldEnd === originalLines.length) return full;
  }
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
