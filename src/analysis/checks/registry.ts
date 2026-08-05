import { anchorNameCheck } from "./anchor-name";
import { autoplayMediaCheck } from "./autoplay-media";
import { buttonNameCheck } from "./button-name";
import { emptyHeadingCheck } from "./empty-heading";
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
];

export function checkById(id: string): AccessibilityCheck | undefined {
  return allChecks.find((check) => check.id === id);
}
