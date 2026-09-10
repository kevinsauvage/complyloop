import { type Finding } from "@complyloop/analysis-core/contract/entities";
import type { SourceLocation } from "@complyloop/analysis-core/contract/finding-types";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { RawFinding } from "@complyloop/analysis-core/types";

import { applyFileEdits } from "./patch-apply";
import { complyLoopGate } from "./patch-gate";
import { assertSingleFileEdits, type ProposedFixEdits } from "./patch-types";

export {
  assertSingleFileEdits,
  fileEditSchema,
  patchCandidateDetailSchema,
  patchCandidateFromDetail,
  patchCandidateToDetail,
  type ComplyLoopGateResult,
  type FileEdit,
  type PatchCandidate,
  type PatchCandidateDetail,
  type ProposedFixEdits,
} from "./patch-types";
export { applyFileEdits } from "./patch-apply";
export { complyLoopGate } from "./patch-gate";

export const PATCH_PR_SOURCE_ONLY_MESSAGE =
  "Patch PRs are only available for source findings. Use the developer handoff for runtime DOM findings.";

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

/**
 * Applies one proposed patch and verifies it with a focused ComplyLoop scan.
 * Never changes Finding or Requirement status.
 */
export async function generatePatchCandidate(
  options: GeneratePatchCandidateOptions,
): Promise<import("./patch-types").PatchCandidate> {
  const findingPath = sourceFilePath(options.finding);
  const baseline = options.scan([findingPath]);
  const proposal = await options.propose();
  assertSingleFileEdits(proposal.edits, findingPath, {
    emptyMessage: "A patch candidate must contain at least one edit.",
    offTargetMessage: (path) =>
      `Patch edits must target ${path} for this Finding.`,
  });
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
