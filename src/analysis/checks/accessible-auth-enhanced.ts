import ts from "typescript";
import {
  CAPTCHA_WITH_CHALLENGE,
  PUZZLE_CAPTCHA,
  PUZZLE_HOSTS,
  matchesMultilingual,
} from "../patterns/multilingual";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";
import { isAuthField } from "./auth-field";

function isObjectRecognitionCaptcha(node: Parameters<typeof getAttribute>[0]): boolean {
  const tag = tagNameOf(node);
  if (PUZZLE_HOSTS.has(tag)) return true;

  const className =
    getAttribute(node, "className") ?? getAttribute(node, "class");
  const classText = className ? (stringValueOf(className) ?? "") : "";
  const id = getAttribute(node, "id");
  const idText = id ? (stringValueOf(id) ?? "") : "";
  const ariaLabel = getAttribute(node, "aria-label");
  const labelText = ariaLabel ? (stringValueOf(ariaLabel) ?? "") : "";
  const context = `${tag} ${classText} ${idText} ${labelText}`;

  if (matchesMultilingual(PUZZLE_CAPTCHA, context)) return true;

  if (matchesMultilingual(CAPTCHA_WITH_CHALLENGE, context)) {
    const size = getAttribute(node, "size");
    const challenge = getAttribute(node, "challenge");
    if (size || challenge) return true;
  }

  return false;
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
