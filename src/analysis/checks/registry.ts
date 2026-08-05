import { anchorNameCheck } from "./anchor-name";
import { ariaHiddenFocusableCheck } from "./aria-hidden-focusable";
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
];

export function checkById(id: string): AccessibilityCheck | undefined {
  return allChecks.find((check) => check.id === id);
}
