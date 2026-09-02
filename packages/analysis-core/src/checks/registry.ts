import { anchorNameCheck } from "./anchor-name.js";
import { ariaHiddenFocusableCheck } from "./aria-hidden-focusable.js";
import { ariaPropsCheck } from "./aria-props.js";
import { ariaRequiredAttrCheck } from "./aria-required-attr.js";
import { ariaRoleCheck } from "./aria-role.js";
import { autocompleteValidCheck } from "./autocomplete-valid.js";
import { autoplayMediaCheck } from "./autoplay-media.js";
import { buttonNameCheck } from "./button-name.js";
import { duplicateIdCheck } from "./duplicate-id.js";
import { emptyHeadingCheck } from "./empty-heading.js";
import { formErrorAssociationCheck } from "./form-error-association.js";
import { headingOrderCheck } from "./heading-order.js";
import { htmlLangCheck } from "./html-lang.js";
import { iframeTitleCheck } from "./iframe-title.js";
import { imgAltCheck } from "./img-alt.js";
import { inputLabelCheck } from "./input-label.js";
import { keyboardInteractionCheck } from "./keyboard-interaction.js";
import { listStructureCheck } from "./list-structure.js";
import { metaViewportCheck } from "./meta-viewport.js";
import { noAutofocusCheck } from "./no-autofocus.js";
import { pointerGestureCheck } from "./pointer-gesture.js";
import { pointerCancellationCheck } from "./pointer-cancellation.js";
import { motionActuationCheck } from "./motion-actuation.js";
import { focusContextChangeCheck } from "./focus-context-change.js";
import { inputContextChangeCheck } from "./input-context-change.js";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics.js";
import { imageOfTextCheck } from "./image-of-text.js";
import { errorSuggestionCheck } from "./error-suggestion.js";
import { positiveTabindexCheck } from "./positive-tabindex.js";
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
import { noAccesskeyCheck } from "./no-accesskey.js";
import { optgroupCheck } from "./optgroup.js";
import { tableCaptionCheck } from "./table-caption.js";
import { thScopeCheck } from "./th-scope.js";
import { layoutTableMarkupCheck } from "./layout-table-markup.js";
import { svgNameCheck } from "./svg-name.js";
import { figureCaptionCheck } from "./figure-caption.js";
import { redundantRoleCheck } from "./redundant-role.js";
import { noninteractiveTabindexCheck } from "./noninteractive-tabindex.js";
import { ariaActivedescendantCheck } from "./aria-activedescendant.js";
import { newWindowOnloadCheck } from "./new-window-onload.js";
import { dirChangeCheck } from "./dir-change.js";
import { blockquoteCiteCheck } from "./blockquote-cite.js";
import { outlineNoneCheck } from "./outline-none.js";
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
import { reducedMotionCheck } from "./reduced-motion.js";
import { captchaAlternativeCheck } from "./captcha-alternative.js";
import { accessibleAuthEnhancedCheck } from "./accessible-auth-enhanced.js";
import type { AccessibilityCheck } from "../types.js";

export const allChecks: AccessibilityCheck[] = [
  imgAltCheck,
  buttonNameCheck,
  anchorNameCheck,
  htmlLangCheck,
  positiveTabindexCheck,
  inputLabelCheck,
  headingOrderCheck,
  emptyHeadingCheck,
  iframeTitleCheck,
  autoplayMediaCheck,
  duplicateIdCheck,
  formErrorAssociationCheck,
  ariaHiddenFocusableCheck,
  ariaRoleCheck,
  ariaPropsCheck,
  ariaRequiredAttrCheck,
  noAutofocusCheck,
  keyboardInteractionCheck,
  metaViewportCheck,
  listStructureCheck,
  autocompleteValidCheck,
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
  noBlinkMarqueeCheck,
  textSpacingCheck,
  emptyThCheck,
  dialogNameCheck,
  tabNameCheck,
  summaryNameCheck,
  pAsHeadingCheck,
  fieldsetLegendCheck,
  autocompletePurposeCheck,
  noAccesskeyCheck,
  optgroupCheck,
  tableCaptionCheck,
  thScopeCheck,
  layoutTableMarkupCheck,
  svgNameCheck,
  figureCaptionCheck,
  redundantRoleCheck,
  noninteractiveTabindexCheck,
  ariaActivedescendantCheck,
  newWindowOnloadCheck,
  dirChangeCheck,
  blockquoteCiteCheck,
  outlineNoneCheck,
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
  reducedMotionCheck,
  captchaAlternativeCheck,
  accessibleAuthEnhancedCheck,
];
