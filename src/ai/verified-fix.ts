import fs from "node:fs";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import type { RawFinding } from "@complyloop/analysis-core/types";
import { type Finding } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ExplanationProvenance } from "@complyloop/analysis-core/contract/statuses";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import type { SourceLocation } from "@complyloop/analysis-core/contract/finding-types";
import { z } from "zod";

export const PATCH_PR_SOURCE_ONLY_MESSAGE =
  "Patch PRs are only available for source findings. Use the developer handoff for runtime DOM findings.";

export interface FileEdit {
  path: string;
  oldText: string;
  newText: string;
}

/** Source-edit shape shared by proposed patches and stored patch details. */
export const fileEditSchema = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string(),
});

export interface ProposedFixEdits {
  description: string;
  provenance: ExplanationProvenance;
  model?: string;
  edits: FileEdit[];
}

interface ComplyLoopGateResult {
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

export interface GeneratePatchCandidateOptions {
  rootPath: string;
  finding: Finding;
  propose: () => Promise<ProposedFixEdits>;
  scan: (relativePaths: string[]) => RawFinding[];
}

function sourceFilePath(finding: Finding): string {
  assertSourceLocatedFinding(finding);
  return finding.location.filePath;
}

/** Rejects runtime DOM findings before patch / PR work. */
export function assertSourceLocatedFinding(
  finding: Finding,
): asserts finding is Finding & { location: SourceLocation } {
  if (!isSourceLocation(finding.location)) {
    throw new PublicError(PATCH_PR_SOURCE_ONLY_MESSAGE);
  }
}

function findingIdentity(finding: {
  checkId: string;
  location: RawFinding["location"] | Finding["location"];
}): string | null {
  if (finding.location.kind !== "source") return null;
  return `${finding.checkId}\0${finding.location.filePath}`;
}

function findingFingerprint(finding: RawFinding): string {
  const identity = findingIdentity(finding);
  return `${identity ?? finding.checkId}\0${finding.reason}`;
}

/** Replaces unique `oldText` occurrences. Restores nothing on failure — caller snapshots. */
export function applyFileEdits(
  rootPath: string,
  edits: ReadonlyArray<FileEdit>,
): string[] {
  const touched: string[] = [];
  for (const edit of edits) {
    const absolute = resolveInside(rootPath, edit.path);
    if (!fs.existsSync(absolute)) {
      throw new PublicError(`File not found in checkout: ${edit.path}`);
    }
    const original = fs.readFileSync(absolute, "utf8");
    const count = original.split(edit.oldText).length - 1;
    if (count === 0) {
      throw new PublicError(
        `Edit oldText not found in ${edit.path}. Generate the patch again.`,
      );
    }
    if (count > 1) {
      throw new PublicError(
        `Edit oldText is not unique in ${edit.path} (${count} matches).`,
      );
    }
    fs.writeFileSync(
      absolute,
      original.replace(edit.oldText, edit.newText),
      "utf8",
    );
    if (!touched.includes(edit.path)) touched.push(edit.path);
  }
  return touched;
}

export function complyLoopGate(
  finding: Finding,
  baseline: ReadonlyArray<RawFinding>,
  after: ReadonlyArray<RawFinding>,
): ComplyLoopGateResult {
  const target = findingIdentity(finding);
  const remaining = after
    .filter((candidate) => findingIdentity(candidate) === target)
    .map((candidate) => candidate.checkId);
  const baselineKeys = new Set(baseline.map(findingFingerprint));
  const newFindings = after.filter(
    (candidate) => !baselineKeys.has(findingFingerprint(candidate)),
  );
  const passed = remaining.length === 0 && newFindings.length === 0;
  return {
    passed,
    remaining: [
      ...remaining,
      ...newFindings.map((candidate) => candidate.checkId),
    ],
  };
}

/**
 * Applies one proposed patch and verifies it with a focused ComplyLoop scan.
 * Never changes Finding or Requirement status.
 */
export async function generatePatchCandidate(
  options: GeneratePatchCandidateOptions,
): Promise<PatchCandidate> {
  const findingPath = sourceFilePath(options.finding);
  const baseline = options.scan([findingPath]);
  const proposal = await options.propose();
  if (proposal.edits.length === 0) {
    throw new PublicError("A patch candidate must contain at least one edit.");
  }
  if (proposal.edits.some((edit) => edit.path !== findingPath)) {
    throw new PublicError(
      `Patch edits must target ${findingPath} for this Finding.`,
    );
  }
  applyFileEdits(options.rootPath, proposal.edits);
  const gate = complyLoopGate(
    options.finding,
    baseline,
    options.scan([findingPath]),
  );
  if (!gate.passed) {
    throw new PublicError(
      `ComplyLoop still reports this Finding or a new failure: ${gate.remaining.join(", ") || options.finding.checkId}.`,
    );
  }
  return {
    description: proposal.description,
    provenance: proposal.provenance,
    ...(proposal.model ? { model: proposal.model } : {}),
    edits: proposal.edits,
    complyLoop: gate,
  };
}
