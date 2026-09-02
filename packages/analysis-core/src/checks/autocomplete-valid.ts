import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

/**
 * Subset of HTML autocomplete tokens we accept when the value is a static string.
 * Dynamic expressions are skipped (unknown).
 * @see https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill
 */
const VALID_TOKENS = new Set([
  "on",
  "off",
  "name",
  "honorific-prefix",
  "given-name",
  "additional-name",
  "family-name",
  "honorific-suffix",
  "nickname",
  "username",
  "new-password",
  "current-password",
  "one-time-code",
  "organization-title",
  "organization",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level1",
  "address-level2",
  "address-level3",
  "address-level4",
  "country",
  "country-name",
  "postal-code",
  "cc-name",
  "cc-given-name",
  "cc-additional-name",
  "cc-family-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "transaction-currency",
  "transaction-amount",
  "language",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
  "sex",
  "url",
  "photo",
  "tel",
  "tel-country-code",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "tel-local-prefix",
  "tel-local-suffix",
  "tel-extension",
  "email",
  "impp",
]);

const SECTION_PREFIX = /^section-/;
const GROUPING = new Set(["shipping", "billing", "home", "work", "mobile", "fax", "pager"]);

function isValidAutocomplete(value: string): boolean {
  const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  for (const token of tokens) {
    if (SECTION_PREFIX.test(token)) continue;
    if (GROUPING.has(token)) continue;
    if (token === "optional" || token === "required") continue;
    if (!VALID_TOKENS.has(token)) return false;
  }
  return true;
}

const FORM_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

export const autocompleteValidCheck: AccessibilityCheck = {
  id: "autocomplete-valid",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!FORM_CONTROL_TAGS.has(tagNameOf(node))) return;
      const attr =
        getAttribute(node, "autoComplete") ?? getAttribute(node, "autocomplete");
      if (!attr) return;
      const value = stringValueOf(attr);
      if (value === undefined) return;
      if (isValidAutocomplete(value)) return;

      findings.push({
        checkId: "autocomplete-valid",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason: `autocomplete="${value}" is not a valid HTML autofill token set (WCAG 1.3.5).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
