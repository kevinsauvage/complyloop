import { autoplayMediaCheck } from "./autoplay-media.ts";
import { buttonNameCheck } from "./button-name.ts";
import { duplicateIdCheck } from "./duplicate-id.ts";
import { formErrorAssociationCheck } from "./form-error-association.ts";
import { headingOrderCheck } from "./heading-order.ts";
import { inputLabelCheck } from "./input-label.ts";
import { listStructureCheck } from "./list-structure.ts";
import { metaViewportCheck } from "./meta-viewport.ts";
import { pointerGestureCheck } from "./pointer-gesture.ts";
import { pointerCancellationCheck } from "./pointer-cancellation.ts";
import { motionActuationCheck } from "./motion-actuation.ts";
import { focusContextChangeCheck } from "./focus-context-change.ts";
import { inputContextChangeCheck } from "./input-context-change.ts";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics.ts";
import { imageOfTextCheck } from "./image-of-text.ts";
import { errorSuggestionCheck } from "./error-suggestion.ts";
import { videoCaptionCheck } from "./video-caption.ts";
import { audioCaptionCheck } from "./audio-caption.ts";
import { noBlinkMarqueeCheck } from "./no-blink-marquee.ts";
import { textSpacingCheck } from "./text-spacing.ts";
import { emptyThCheck } from "./empty-th.ts";
import { dialogNameCheck } from "./dialog-name.ts";
import { tabNameCheck } from "./tab-name.ts";
import { summaryNameCheck } from "./summary-name.ts";
import { pAsHeadingCheck } from "./p-as-heading.ts";
import { fieldsetLegendCheck } from "./fieldset-legend.ts";
import { autocompletePurposeCheck } from "./autocomplete-purpose.ts";
import { optgroupCheck } from "./optgroup.ts";
import { tableCaptionCheck } from "./table-caption.ts";
import { layoutTableMarkupCheck } from "./layout-table-markup.ts";
import { svgNameCheck } from "./svg-name.ts";
import { figureCaptionCheck } from "./figure-caption.ts";
import { newWindowOnloadCheck } from "./new-window-onload.ts";
import { dirChangeCheck } from "./dir-change.ts";
import { blockquoteCiteCheck } from "./blockquote-cite.ts";
import { statusLiveCheck } from "./status-live.ts";
import { accessibleAuthCheck } from "./accessible-auth.ts";
import { draggingCheck } from "./dragging.ts";
import { bothColorsCheck } from "./both-colors.ts";
import { redundantEntryCheck } from "./redundant-entry.ts";
import { tableSummaryCheck } from "./table-summary.ts";
import { imageDetailedDescriptionCheck } from "./image-detailed-description.ts";
import { mediaControlsPresentCheck } from "./media-controls-present.ts";
import { nontemporalMediaAltCheck } from "./nontemporal-media-alt.ts";
import { fieldGroupingCheck } from "./field-grouping.ts";
import { noAutoRefreshCheck } from "./no-auto-refresh.ts";
import { audioDescriptionTrackCheck } from "./audio-description-track.ts";
import { linkExplicitHeuristicCheck } from "./link-explicit-heuristic.ts";
import { officeDocsAltPresentCheck } from "./office-docs-alt-present.ts";
import { mediaKeyboardStaticCheck } from "./media-keyboard-static.ts";
import { decorativeIgnoredCheck } from "./decorative-ignored.ts";
import { langChangeCheck } from "./lang-change.ts";
import { crypticContentAltCheck } from "./cryptic-content-alt.ts";
import { audioDescriptionOrAltCheck } from "./audio-description-or-alt.ts";
import { captionsLiveCheck } from "./captions-live.ts";
import { errorPreventionCheck } from "./error-prevention.ts";
import { captchaAlternativeCheck } from "./captcha-alternative.ts";
import { accessibleAuthEnhancedCheck } from "./accessible-auth-enhanced.ts";
import type { AccessibilityCheck } from "../types.ts";

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
  focusContextChangeCheck,
  inputContextChangeCheck,
  sensoryCharacteristicsCheck,
  imageOfTextCheck,
  errorSuggestionCheck,
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
