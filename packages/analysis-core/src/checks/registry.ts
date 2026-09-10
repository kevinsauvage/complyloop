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
 * Stable signature of the shipped AST check set. Changes when a check is added
 * or removed, so a re-assessment can safely reuse prior AST findings at an
 * unchanged git HEAD only when the engine set is identical.
 */
export function checkRegistrySignature(): string {
  return allChecks
    .map((check) => check.id)
    .sort()
    .join("|");
}
