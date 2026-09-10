import {
  buttonNameCheck,
  dialogNameCheck,
  svgNameCheck,
  summaryNameCheck,
  tabNameCheck,
} from "./families/names.ts";
import {
  inputLabelCheck,
  formErrorAssociationCheck,
  fieldGroupingCheck,
  fieldsetLegendCheck,
  optgroupCheck,
  autocompletePurposeCheck,
  errorPreventionCheck,
  redundantEntryCheck,
  accessibleAuthCheck,
  accessibleAuthEnhancedCheck,
  captchaAlternativeCheck,
} from "./families/forms.ts";
import {
  autoplayMediaCheck,
  audioCaptionCheck,
  audioDescriptionOrAltCheck,
  audioDescriptionTrackCheck,
  videoCaptionCheck,
  captionsLiveCheck,
  mediaControlsPresentCheck,
  mediaKeyboardStaticCheck,
  nontemporalMediaAltCheck,
  imageDetailedDescriptionCheck,
  officeDocsAltPresentCheck,
} from "./families/media.ts";
import {
  headingOrderCheck,
  listStructureCheck,
  pAsHeadingCheck,
  emptyThCheck,
  tableCaptionCheck,
  tableSummaryCheck,
  layoutTableMarkupCheck,
  figureCaptionCheck,
  blockquoteCiteCheck,
  duplicateIdCheck,
  decorativeIgnoredCheck,
} from "./families/structure.ts";
import {
  motionActuationCheck,
  noBlinkMarqueeCheck,
  noAutoRefreshCheck,
  draggingCheck,
  pointerCancellationCheck,
  pointerGestureCheck,
} from "./families/motion.ts";
import {
  statusLiveCheck,
  newWindowOnloadCheck,
  dirChangeCheck,
  langChangeCheck,
  metaViewportCheck,
  textSpacingCheck,
  bothColorsCheck,
  crypticContentAltCheck,
  linkExplicitHeuristicCheck,
} from "./families/behavior.ts";
import type { AccessibilityCheck } from "../types.ts";

export const allChecks: AccessibilityCheck[] = [  buttonNameCheck,
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
  bothColorsCheck,
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
export const ANALYSIS_ENGINE_VERSION = "2026.09.10.1";

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
