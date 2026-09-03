import { autoplayMediaCheck } from "./autoplay-media.js";
import { buttonNameCheck } from "./button-name.js";
import { duplicateIdCheck } from "./duplicate-id.js";
import { formErrorAssociationCheck } from "./form-error-association.js";
import { headingOrderCheck } from "./heading-order.js";
import { inputLabelCheck } from "./input-label.js";
import { listStructureCheck } from "./list-structure.js";
import { metaViewportCheck } from "./meta-viewport.js";
import { pointerGestureCheck } from "./pointer-gesture.js";
import { pointerCancellationCheck } from "./pointer-cancellation.js";
import { motionActuationCheck } from "./motion-actuation.js";
import { focusContextChangeCheck } from "./focus-context-change.js";
import { inputContextChangeCheck } from "./input-context-change.js";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics.js";
import { imageOfTextCheck } from "./image-of-text.js";
import { errorSuggestionCheck } from "./error-suggestion.js";
import { videoCaptionCheck } from "./video-caption.js";
import { audioCaptionCheck } from "./audio-caption.js";
import { noBlinkMarqueeCheck } from "./no-blink-marquee.js";
import { textSpacingCheck } from "./text-spacing.js";
import { emptyThCheck } from "./empty-th.js";
import { dialogNameCheck } from "./dialog-name.js";
import { tabNameCheck } from "./tab-name.js";
import { summaryNameCheck } from "./summary-name.js";
import { pAsHeadingCheck } from "./p-as-heading.js";
import { fieldsetLegendCheck } from "./fieldset-legend.js";
import { autocompletePurposeCheck } from "./autocomplete-purpose.js";
import { optgroupCheck } from "./optgroup.js";
import { tableCaptionCheck } from "./table-caption.js";
import { layoutTableMarkupCheck } from "./layout-table-markup.js";
import { svgNameCheck } from "./svg-name.js";
import { figureCaptionCheck } from "./figure-caption.js";
import { newWindowOnloadCheck } from "./new-window-onload.js";
import { dirChangeCheck } from "./dir-change.js";
import { blockquoteCiteCheck } from "./blockquote-cite.js";
import { statusLiveCheck } from "./status-live.js";
import { accessibleAuthCheck } from "./accessible-auth.js";
import { draggingCheck } from "./dragging.js";
import { bothColorsCheck } from "./both-colors.js";
import { redundantEntryCheck } from "./redundant-entry.js";
import { tableSummaryCheck } from "./table-summary.js";
import { imageDetailedDescriptionCheck } from "./image-detailed-description.js";
import { mediaControlsPresentCheck } from "./media-controls-present.js";
import { nontemporalMediaAltCheck } from "./nontemporal-media-alt.js";
import { fieldGroupingCheck } from "./field-grouping.js";
import { noAutoRefreshCheck } from "./no-auto-refresh.js";
import { audioDescriptionTrackCheck } from "./audio-description-track.js";
import { linkExplicitHeuristicCheck } from "./link-explicit-heuristic.js";
import { officeDocsAltPresentCheck } from "./office-docs-alt-present.js";
import { mediaKeyboardStaticCheck } from "./media-keyboard-static.js";
import { decorativeIgnoredCheck } from "./decorative-ignored.js";
import { langChangeCheck } from "./lang-change.js";
import { crypticContentAltCheck } from "./cryptic-content-alt.js";
import { audioDescriptionOrAltCheck } from "./audio-description-or-alt.js";
import { captionsLiveCheck } from "./captions-live.js";
import { errorPreventionCheck } from "./error-prevention.js";
import { captchaAlternativeCheck } from "./captcha-alternative.js";
import { accessibleAuthEnhancedCheck } from "./accessible-auth-enhanced.js";
import type { AccessibilityCheck } from "../types.js";

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
