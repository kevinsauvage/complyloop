import { isCompositionSensitiveCheck } from "./check-authority";
import type { RawFinding } from "./types";

/**
 * When runtime owns composition-sensitive rules, drop AST findings for those
 * check ids so requirement status is not driven by false primitive hits.
 */
export function filterAstFindingsForAuthority(
  astFindings: ReadonlyArray<RawFinding>,
  runtimeRan: boolean,
): RawFinding[] {
  if (!runtimeRan) return [...astFindings];
  return astFindings.filter(
    (finding) => !isCompositionSensitiveCheck(finding.checkId),
  );
}
