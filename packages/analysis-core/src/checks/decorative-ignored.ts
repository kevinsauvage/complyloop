import { isAriaHidden, isPresentationRole } from "../a11y-aria";
import { hasAriaName } from "../jsx-primitives";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const IMAGE_HOSTS = new Set([
  "img",
  "Image",
  "area",
  "svg",
  "canvas",
  "object",
  "embed",
]);

function stringAttribute(node: JsxTagNode, name: string): string | undefined {
  const attribute = getAttribute(node, name);
  return attribute ? stringValueOf(attribute) : undefined;
}

function altText(node: JsxTagNode): string | undefined {
  const alt = getAttribute(node, "alt");
  return alt ? stringValueOf(alt) : undefined;
}

function isMarkedDecorative(node: JsxTagNode): boolean {
  if (isAriaHidden(node) || isPresentationRole(node)) return true;
  const alt = altText(node);
  return alt !== undefined && alt.length === 0;
}

function exposesAccessibleName(node: JsxTagNode): boolean {
  const alt = altText(node);
  if (alt !== undefined && alt.trim().length > 0) return true;
  return hasAriaName(node);
}

function isImageHost(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (IMAGE_HOSTS.has(tag)) return true;
  if (tag === "input" && stringAttribute(node, "type") === "image") return true;
  return false;
}

export const decorativeIgnoredCheck: AccessibilityCheck = {
  id: "decorative-ignored",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isImageHost(node)) return;

      const decorative = isMarkedDecorative(node);
      const named = exposesAccessibleName(node);

      if (isPresentationRole(node) && named) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            'A decorative image uses role="presentation" or role="none" but still exposes an accessible name (alt, aria-label, or title), so assistive technologies may announce it.',
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      if (decorative && hasAriaName(node, { includeTitle: true })) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            "A decorative image is marked with an empty alt or aria-hidden but still has aria-label or title, so it may be announced.",
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      const alt = altText(node);
      if (alt !== undefined && alt.length > 0 && /^\s+$/.test(alt)) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            'Whitespace-only alt text is not equivalent to alt=""; assistive technologies may still treat the image as informative.',
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
