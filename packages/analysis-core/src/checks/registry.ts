import type { AccessibilityCheck } from "../types.ts";
import {
  crypticContentAltCheck,
  dirChangeCheck,
  langChangeCheck,
  linkExplicitHeuristicCheck,
  metaViewportCheck,
  newWindowOnloadCheck,
  statusLiveCheck,
  textSpacingCheck,
} from "./families/behavior.ts";
import {
  accessibleAuthCheck,
  accessibleAuthEnhancedCheck,
  autocompletePurposeCheck,
  captchaAlternativeCheck,
  errorPreventionCheck,
  fieldGroupingCheck,
  fieldsetLegendCheck,
  formErrorAssociationCheck,
  inputLabelCheck,
  optgroupCheck,
  redundantEntryCheck,
} from "./families/forms.ts";
import {
  audioCaptionCheck,
  audioDescriptionOrAltCheck,
  audioDescriptionTrackCheck,
  autoplayMediaCheck,
  captionsLiveCheck,
  imageDetailedDescriptionCheck,
  mediaControlsPresentCheck,
  mediaKeyboardStaticCheck,
  nontemporalMediaAltCheck,
  officeDocsAltPresentCheck,
  videoCaptionCheck,
} from "./families/media.ts";
import {
  draggingCheck,
  motionActuationCheck,
  noAutoRefreshCheck,
  noBlinkMarqueeCheck,
  pointerCancellationCheck,
  pointerGestureCheck,
} from "./families/motion.ts";
import {
  buttonNameCheck,
  dialogNameCheck,
  summaryNameCheck,
  svgNameCheck,
  tabNameCheck,
} from "./families/names.ts";
import {
  blockquoteCiteCheck,
  decorativeIgnoredCheck,
  duplicateIdCheck,
  emptyThCheck,
  figureCaptionCheck,
  headingOrderCheck,
  layoutTableMarkupCheck,
  listStructureCheck,
  pAsHeadingCheck,
  tableCaptionCheck,
  tableSummaryCheck,
} from "./families/structure.ts";

export const allChecks: AccessibilityCheck[] = [
  buttonNameCheck,
  headingOrderCheck,
  inputLabelCheck,
  autoplayMediaCheck,
  duplicateIdCheck,
  formErrorAssociationCheck,
  noBlinkMarqueeCheck,
  metaViewportCheck,
  listStructureCheck,
  pointerGestureCheck,
  pointerCancellationCheck,
  motionActuationCheck,
  videoCaptionCheck,
  audioCaptionCheck,
  textSpacingCheck,
  emptyThCheck,
  dialogNameCheck,
  tabNameCheck,
  summaryNameCheck,
  pAsHeadingCheck,
  fieldsetLegendCheck,
  autocompletePurposeCheck,
  optgroupCheck,
  tableCaptionCheck,
  layoutTableMarkupCheck,
  svgNameCheck,
  figureCaptionCheck,
  newWindowOnloadCheck,
  dirChangeCheck,
  blockquoteCiteCheck,
  statusLiveCheck,
  accessibleAuthCheck,
  draggingCheck,
  redundantEntryCheck,
  tableSummaryCheck,
  imageDetailedDescriptionCheck,
  mediaControlsPresentCheck,
  nontemporalMediaAltCheck,
  fieldGroupingCheck,
  noAutoRefreshCheck,
  audioDescriptionTrackCheck,
  linkExplicitHeuristicCheck,
  officeDocsAltPresentCheck,
  mediaKeyboardStaticCheck,
  decorativeIgnoredCheck,
  langChangeCheck,
  crypticContentAltCheck,
  audioDescriptionOrAltCheck,
  captionsLiveCheck,
  errorPreventionCheck,
  captchaAlternativeCheck,
  accessibleAuthEnhancedCheck,
];

/**
 * Version of the analysis engine's observable behavior. Bump whenever AST
 * check logic, snippet extraction, predicates, or fixes change without a check
 * id change — otherwise a re-assessment at an unchanged git HEAD reuses prior
 * findings and the new behavior never runs on unchanged sources.
 */
/**
 * Behavior version of the shipped AST engine. Bump when a change alters
 * findings for unchanged source (check removed/added, verdict or severity
 * changed) so `checkRegistrySignature()` invalidates reused scans and the next
 * run re-derives. 2026.09.24.1: retired `both-colors`, captcha-alternative
 * downgraded to a warning, status-live toaster heuristic removed.
 */
export const ANALYSIS_ENGINE_VERSION = "2026.09.24.1";

/**
 * Stable signature of the shipped AST engine: behavior version + check id set.
 * Changes when a check is added/removed or the engine's behavior changes, so a
 * re-assessment can safely reuse prior AST findings at an unchanged git HEAD
 * only when the engine is byte-for-byte behaviorally identical.
 */
export function checkRegistrySignature(): string {
  const checkIds = allChecks
    .map((check) => check.id)
    .sort()
    .join("|");
  return `${ANALYSIS_ENGINE_VERSION}#${checkIds}`;
}
