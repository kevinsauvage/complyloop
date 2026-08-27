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
];
