import { isAriaHidden, isPresentationRole } from "../a11y-aria";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives";
import {
  booleanAttributeValue,
  getAttribute,
  hasTextContent,
  humanizeFileName,
  jsxElementOf,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const GENERIC_ALT = /^(image|img|photo|picture|icon)$/i;
const IMAGE_MIME = /^image\//i;

function hasAltAttribute(node: JsxTagNode): boolean {
  return getAttribute(node, "alt") !== undefined;
}

function stringAttribute(node: JsxTagNode, name: string): string | undefined {
  const attribute = getAttribute(node, name);
  return attribute ? stringValueOf(attribute) : undefined;
}

function hasServerSideImageMap(node: JsxTagNode): boolean {
  return (
    booleanAttributeValue(getAttribute(node, "isMap")) === true ||
    booleanAttributeValue(getAttribute(node, "ismap")) === true
  );
}

function defaultAltFor(node: JsxTagNode): string {
  const src = getAttribute(node, "src");
  const srcValue = src ? stringValueOf(src) : undefined;
  const humanized = srcValue ? humanizeFileName(srcValue) : "";
  return humanized.length > 0 ? humanized : "Describe this image";
}

function pushMissingAltFinding(
  findings: RawFinding[],
  source: Parameters<AccessibilityCheck["run"]>[0],
  node: JsxTagNode,
  reason: string,
): void {
  findings.push({
    checkId: "img-alt",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason,
    location: locationOf(source, node),
    fix: {
      kind: "insert_attribute",
      attribute: "alt",
      value: defaultAltFor(node),
      editable: true,
      span: spanOf(node, source.sourceFile),
    },
  });
}

export const imgAltCheck: AccessibilityCheck = {
  id: "img-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (isPropSpreadingHost(node)) return;

      if (tag === "img" || tag === "Image") {
        if (hasServerSideImageMap(node)) {
          findings.push({
            checkId: "img-alt",
            kind: "violation",
            severity: "serious",
            confidence: "high",
            reason:
              "Server-side image maps (<img isMap>) need an equivalent list of links; alt text alone is not sufficient.",
            location: locationOf(source, node),
            fix: null,
          });
          return;
        }
        const alt = getAttribute(node, "alt");
        if (!alt) {
          pushMissingAltFinding(
            findings,
            source,
            node,
            `<${tag}> has no alt attribute, so assistive technologies cannot describe the image.`,
          );
          return;
        }
        const altText = stringValueOf(alt);
        if (altText !== undefined && GENERIC_ALT.test(altText.trim())) {
          findings.push({
            checkId: "img-alt",
            kind: "warning",
            severity: "moderate",
            confidence: "medium",
            reason: `alt="${altText}" is generic and does not describe the image; a human should judge whether it is adequate.`,
            location: locationOf(source, node),
            fix: null,
          });
        }
        return;
      }

      if (tag === "area") {
        if (!hasAltAttribute(node)) {
          pushMissingAltFinding(
            findings,
            source,
            node,
            "<area> has no alt attribute, so users cannot understand the target of this image-map area.",
          );
        }
        return;
      }

      if (tag === "input" && stringAttribute(node, "type") === "image") {
        if (!hasAltAttribute(node)) {
          pushMissingAltFinding(
            findings,
            source,
            node,
            '<input type="image"> has no alt attribute, so its purpose is not announced to assistive technologies.',
          );
        }
        return;
      }

      const role = stringAttribute(node, "role");
      if (role === "img") {
        if (!isAriaHidden(node) && !isPresentationRole(node) && !hasAriaName(node)) {
          findings.push({
            checkId: "img-alt",
            kind: "violation",
            severity: "serious",
            confidence: "high",
            reason:
              'Elements with role="img" need an accessible name (aria-label, aria-labelledby, or title).',
            location: locationOf(source, node),
            fix: null,
          });
        }
        return;
      }

      if (tag === "object" || tag === "embed") {
        const typeValue = stringAttribute(node, "type");
        if (!typeValue || !IMAGE_MIME.test(typeValue)) return;
        if (isAriaHidden(node) || isPresentationRole(node)) return;
        if (!hasAriaName(node)) {
          findings.push({
            checkId: "img-alt",
            kind: "violation",
            severity: "serious",
            confidence: "high",
            reason: `<${tag}> embeds an image/* resource without an accessible name (aria-label, aria-labelledby, or title).`,
            location: locationOf(source, node),
            fix: null,
          });
        }
        return;
      }

      if (tag === "canvas") {
        if (isAriaHidden(node) || isPresentationRole(node)) return;
        if (hasAriaName(node)) return;
        const element = jsxElementOf(node);
        if (element && hasTextContent(element)) return;
        findings.push({
          checkId: "img-alt",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "<canvas> that conveys information needs an accessible name or fallback text content.",
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
