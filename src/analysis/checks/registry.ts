import { anchorNameCheck } from "./anchor-name";
import { buttonNameCheck } from "./button-name";
import { htmlLangCheck } from "./html-lang";
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
];

export function checkById(id: string): AccessibilityCheck | undefined {
  return allChecks.find((check) => check.id === id);
}
