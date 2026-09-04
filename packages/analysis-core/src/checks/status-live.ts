import ts from "typescript";
import {
  booleanAttributeValue,
  getAttribute,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import { descendantTags } from "./heuristic-utils.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

function isLiveRegion(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  const role = getAttribute(node, "role");
  const roleValue = role ? stringValueOf(role)?.toLowerCase() : undefined;
  if (roleValue === "status" || roleValue === "alert") return true;
  return getAttribute(node, "aria-live") !== undefined;
}

function describedByIsLive(
  sourceFile: ts.SourceFile,
  describedBy: string,
): boolean {
  const ids = describedBy.split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const found = findElementById(sourceFile, id);
    if (!found) continue;
    if (isLiveRegion(found)) return true;
  }
  return false;
}

function findElementById(
  sourceFile: ts.SourceFile,
  id: string,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
  let match: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined;
  visitJsxTags(sourceFile, (node) => {
    if (match) return;
    const idAttr = getAttribute(node, "id");
    if (idAttr && stringValueOf(idAttr) === id) match = node;
  });
  return match;
}

function siblingsIncludeLiveRegion(node: JsxTagNode): boolean {
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (ts.isJsxElement(parent)) {
      for (const child of parent.children) {
        const tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined =
          ts.isJsxElement(child)
            ? child.openingElement
            : ts.isJsxSelfClosingElement(child)
              ? child
              : undefined;
        if (tag && tag !== node && isLiveRegion(tag)) return true;
      }
      return false;
    }
    parent = parent.parent;
  }
  return false;
}

function isInvalidField(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  const invalid = getAttribute(node, "aria-invalid");
  if (!invalid) return false;
  const value = booleanAttributeValue(invalid);
  return value === true || stringValueOf(invalid)?.toLowerCase() === "true";
}

export const statusLiveCheck: AccessibilityCheck = {
  id: "status-live",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag === "Toaster" || tag === "Sonner") {
        const role = getAttribute(node, "role");
        const live = getAttribute(node, "aria-live");
        if (!role && !live) {
          findings.push({
            checkId: "status-live",
            kind: "warning",
            severity: "moderate",
            confidence: "low",
            reason: `${tag} renders status messages without aria-live or role="status"/"alert" on the host (WCAG 4.1.3).`,
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
    });

    visitJsxTags(source.sourceFile, (node) => {
      if (!isInvalidField(node)) return;
      const describedBy = getAttribute(node, "aria-describedby");
      const describedValue = describedBy ? stringValueOf(describedBy) : undefined;
      if (describedValue && describedByIsLive(source.sourceFile, describedValue)) {
        return;
      }
      const element = jsxElementOf(node);
      if (element && descendantTags(element).some((tag) => isLiveRegion(tag))) {
        return;
      }
      if (siblingsIncludeLiveRegion(node)) {
        return;
      }

      findings.push({
        checkId: "status-live",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Invalid field exposes validation feedback without a live region (role=\"status\", role=\"alert\", or aria-live) so screen readers announce the error (WCAG 4.1.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
