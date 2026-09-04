import {
  isCompositionSensitiveCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
} from "./check-authority.ts";
import type { RawFinding } from "./types.ts";

/**
 * When runtime owns composition-sensitive OR runtime-only rules, drop AST
 * findings for those check ids so requirement status is not driven by false
 * primitive hits and a defect seen on both source and rendered DOM yields one
 * finding, not two. Same precedent as `keepOpenWhenRuntimeScanSkipped`: the
 * runtime verdict wins when it ran; when it did not, source findings stay and
 * drive CI and the requirement.
 */
export function filterAstFindingsForAuthority(
  astFindings: ReadonlyArray<RawFinding>,
  runtimeRan: boolean,
): RawFinding[] {
  if (!runtimeRan) return [...astFindings];
  return astFindings.filter(
    (finding) =>
      !isCompositionSensitiveCheck(finding.checkId) &&
      !isRuntimeOnlyCheck(finding.checkId) &&
      !isPackageTwinSourceCheck(finding.checkId),
  );
}
