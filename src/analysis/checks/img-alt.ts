import {
  getAttribute,
  humanizeFileName,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const GENERIC_ALT = /^(image|img|photo|picture|icon)$/i;

function defaultAltFor(node: JsxTagNode): string {
  const src = getAttribute(node, "src");
  const srcValue = src ? stringValueOf(src) : undefined;
  const humanized = srcValue ? humanizeFileName(srcValue) : "";
  return humanized.length > 0 ? humanized : "Describe this image";
}

export const imgAltCheck: AccessibilityCheck = {
  id: "img-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "img" && tag !== "Image") return;

      const alt = getAttribute(node, "alt");
      if (!alt) {
        findings.push({
          checkId: "img-alt",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `<${tag}> has no alt attribute, so assistive technologies cannot describe the image.`,
          location: locationOf(source, node),
          fix: {
            kind: "insert_attribute",
            attribute: "alt",
            value: defaultAltFor(node),
            editable: true,
            span: spanOf(node, source.sourceFile),
          },
        });
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
    });
    return findings;
  },
};
