import { anchorNameCheck } from "./anchor-name";
import { ariaHiddenFocusableCheck } from "./aria-hidden-focusable";
import { ariaPropsCheck } from "./aria-props";
import { ariaRequiredAttrCheck } from "./aria-required-attr";
import { ariaRoleCheck } from "./aria-role";
import { autocompleteValidCheck } from "./autocomplete-valid";
import { autoplayMediaCheck } from "./autoplay-media";
import { buttonNameCheck } from "./button-name";
import { duplicateIdCheck } from "./duplicate-id";
import { emptyHeadingCheck } from "./empty-heading";
import { formErrorAssociationCheck } from "./form-error-association";
import { headingOrderCheck } from "./heading-order";
import { htmlLangCheck } from "./html-lang";
import { iframeTitleCheck } from "./iframe-title";
import { imgAltCheck } from "./img-alt";
import { inputLabelCheck } from "./input-label";
import { keyboardInteractionCheck } from "./keyboard-interaction";
import { listStructureCheck } from "./list-structure";
import { metaViewportCheck } from "./meta-viewport";
import { noAutofocusCheck } from "./no-autofocus";
import { pointerGestureCheck } from "./pointer-gesture";
import { pointerCancellationCheck } from "./pointer-cancellation";
import { motionActuationCheck } from "./motion-actuation";
import { focusContextChangeCheck } from "./focus-context-change";
import { inputContextChangeCheck } from "./input-context-change";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics";
import { imageOfTextCheck } from "./image-of-text";
import { errorSuggestionCheck } from "./error-suggestion";
import { positiveTabindexCheck } from "./positive-tabindex";
import { videoCaptionCheck } from "./video-caption";
import { audioCaptionCheck } from "./audio-caption";
import { noBlinkMarqueeCheck } from "./no-blink-marquee";
import { textSpacingCheck } from "./text-spacing";
import { emptyThCheck } from "./empty-th";
import { dialogNameCheck } from "./dialog-name";
import { tabNameCheck } from "./tab-name";
import { summaryNameCheck } from "./summary-name";
import { pAsHeadingCheck } from "./p-as-heading";
import { fieldsetLegendCheck } from "./fieldset-legend";
import { autocompletePurposeCheck } from "./autocomplete-purpose";
import { noAccesskeyCheck } from "./no-accesskey";
import { optgroupCheck } from "./optgroup";
import { tableCaptionCheck } from "./table-caption";
import { thScopeCheck } from "./th-scope";
import { layoutTableMarkupCheck } from "./layout-table-markup";
import { svgNameCheck } from "./svg-name";
import { figureCaptionCheck } from "./figure-caption";
import { redundantRoleCheck } from "./redundant-role";
import { noninteractiveTabindexCheck } from "./noninteractive-tabindex";
import { ariaActivedescendantCheck } from "./aria-activedescendant";
import { newWindowOnloadCheck } from "./new-window-onload";
import { dirChangeCheck } from "./dir-change";
import { blockquoteCiteCheck } from "./blockquote-cite";
import { outlineNoneCheck } from "./outline-none";
import { statusLiveCheck } from "./status-live";
import { accessibleAuthCheck } from "./accessible-auth";
import { draggingCheck } from "./dragging";
import { bothColorsCheck } from "./both-colors";
import { redundantEntryCheck } from "./redundant-entry";
import type { AccessibilityCheck } from "../types";

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
];
