import ts from "typescript";
import { isObjectRecognitionCaptchaSignal } from "../patterns/object-recognition-captcha.ts";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { isAuthField } from "./auth-field.ts";
import { attributeContextOf } from "./heuristic-utils.ts";

function isObjectRecognitionCaptcha(node: Parameters<typeof getAttribute>[0]): boolean {
  const ariaLabel = getAttribute(node, "aria-label");
  const labelText = ariaLabel ? (stringValueOf(ariaLabel) ?? "") : "";
  const size = getAttribute(node, "size");
  const challenge = getAttribute(node, "challenge");

  return isObjectRecognitionCaptchaSignal({
    tagName: tagNameOf(node),
    contextText: `${attributeContextOf(node)} ${labelText}`,
    hasSizeOrChallengeAttr: Boolean(size || challenge),
  });
}

function authContextNearby(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let foundAuth = false;
  visitJsxTags(sourceFile, (candidate) => {
    if (foundAuth) return;
    if (!isAuthField(candidate)) return;
    if (
      candidate.getStart() >= node.getStart() - 4000 &&
      candidate.getStart() <= node.getEnd() + 4000
    ) {
      foundAuth = true;
    }
  });
  return foundAuth;
}

export const accessibleAuthEnhancedCheck: AccessibilityCheck = {
  id: "accessible-auth-enhanced",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxTags(source.sourceFile, (node) => {
      if (!isObjectRecognitionCaptcha(node)) return;
      if (!authContextNearby(node, source.sourceFile)) return;

      findings.push({
        checkId: "accessible-auth-enhanced",
        kind: "warning",
        severity: "serious",
        confidence: "medium",
        reason:
          "Authentication may require object-recognition or image-selection CAPTCHA without an allowed alternative (WCAG 3.3.9).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
