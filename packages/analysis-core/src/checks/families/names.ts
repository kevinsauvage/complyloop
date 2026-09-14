import ts from "typescript";

import { explicitRoles, isDecorativeOrHidden } from "../../a11y-aria.ts";
import type { CheckId } from "../../check-registry.ts";
import {
  getAttribute,
  hasAriaName,
  hasTextContent,
  isPropSpreadingHost,
  jsxElementOf,
  type JsxTagNode,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../../types.ts";
import { descendantTags, isInsideNamingHost } from "../heuristic-utils.ts";

interface NamedElementConfig {
  id: string;
  reason: string;
  severity: RawFinding["severity"];
  /** Extra condition for "already named" beyond aria/text content. */
  hasName?: (node: JsxTagNode) => boolean;
}

function namedElementFinding(
  source: import("../../parse.ts").ParsedSource,
  node: JsxTagNode,
  config: NamedElementConfig & { id: CheckId },
): RawFinding | null {
  if (isPropSpreadingHost(node)) return null;
  if (config.hasName?.(node)) return null;
  if (hasAriaName(node)) return null;
  const element = jsxElementOf(node);
  if (element && hasTextContent(element)) return null;
  return {
    checkId: config.id,
    kind: "violation",
    severity: config.severity,
    confidence: "high",
    reason: config.reason,
    location: locationOf(source, node),
    fix: null,
  };
}

function hasTitleChild(node: JsxTagNode): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => {
    if (tagNameOf(tag) !== "title") return false;
    const titleElement = jsxElementOf(tag);
    return titleElement ? hasTextContent(titleElement) : false;
  });
}

function isDialog(node: JsxTagNode): boolean {
  if (tagNameOf(node) === "dialog") return true;
  const role = getAttribute(node, "role");
  const value = role ? stringValueOf(role) : undefined;
  return value === "dialog" || value === "alertdialog";
}

export const svgNameCheck: AccessibilityCheck = {
  id: "svg-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "svg") return;
      if (isDecorativeOrHidden(node)) return;
      if (isInsideNamingHost(node)) return;
      if (hasAriaName(node) || hasTitleChild(node)) {
        if (explicitRoles(node).includes("img")) return;
        findings.push({
          checkId: "svg-name",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            'Standalone <svg> that conveys information must set role="img" (RGAA 1.1.5).',
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }
      const finding = namedElementFinding(source, node, {
        id: "svg-name",
        reason:
          "Standalone <svg> has no accessible name (title, aria-label, or aria-labelledby) and is not marked decorative.",
        severity: "serious",
      });
      if (finding) findings.push(finding);
    });
    return findings;
  },
};

export const buttonNameCheck: AccessibilityCheck = {
  id: "button-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "button") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;
      const named =
        ts.isJsxOpeningElement(node) &&
        ts.isJsxElement(node.parent) &&
        hasTextContent(node.parent);
      if (named) return;
      findings.push({
        checkId: "button-name",
        kind: "violation",
        severity: "critical",
        confidence: "high",
        reason:
          "<button> has no text content and no aria-label, so screen reader users hear only \u201cbutton\u201d with no clue what it does.",
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "aria-label",
          value: "Describe this action",
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};

export const tabNameCheck: AccessibilityCheck = {
  id: "tab-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const role = getAttribute(node, "role");
      const roleValue = role ? stringValueOf(role) : undefined;
      if (roleValue !== "tab") return;
      const finding = namedElementFinding(source, node, {
        id: "tab-name",
        reason:
          'role="tab" has no accessible name, so keyboard and screen reader users cannot tell the tabs apart.',
        severity: "serious",
      });
      if (finding) findings.push(finding);
    });
    return findings;
  },
};

export const summaryNameCheck: AccessibilityCheck = {
  id: "summary-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "summary") return;
      const finding = namedElementFinding(source, node, {
        id: "summary-name",
        reason:
          "<summary> has no accessible name, so disclosure controls are announced without a label.",
        severity: "serious",
      });
      if (finding) findings.push(finding);
    });
    return findings;
  },
};

export const dialogNameCheck: AccessibilityCheck = {
  id: "dialog-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDialog(node)) return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;
      findings.push({
        checkId: "dialog-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Dialog has no accessible name (aria-label, aria-labelledby, or title), so screen reader users hear only \u201cdialog\u201d with no title.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};