import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const PURPOSE_TYPES = new Set(["email", "password", "tel", "url"]);

const PURPOSE_NAMES =
  /^(email|username|user[_-]?name|password|name|given-?name|family-?name|tel|phone|street-?address|address|postal-?code|zip|city|country)$/i;

const SKIP_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "submit",
  "reset",
  "button",
  "file",
  "image",
  "range",
  "color",
  "search",
]);

function needsPurpose(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (tag !== "input") return false;
  const typeAttr = getAttribute(node, "type");
  const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
  if (SKIP_TYPES.has(type)) return false;
  if (PURPOSE_TYPES.has(type)) return true;
  const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
  const name = nameAttr ? stringValueOf(nameAttr) : undefined;
  return Boolean(name && PURPOSE_NAMES.test(name));
}

export const autocompletePurposeCheck: AccessibilityCheck = {
  id: "autocomplete-purpose",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!needsPurpose(node)) return;
      if (
        getAttribute(node, "autoComplete") !== undefined ||
        getAttribute(node, "autocomplete") !== undefined
      ) {
        return;
      }

      findings.push({
        checkId: "autocomplete-purpose",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "Identity field has no autocomplete token, so browsers and password managers cannot fill it (WCAG 1.3.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
