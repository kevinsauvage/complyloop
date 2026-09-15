import type { CheckId } from "../check-registry.ts";

/**
 * Maps axe-core rule ids to ComplyLoop check ids.
 * Unmapped axe rules are ignored (we only status controls we model).
 */
const AXE_TO_CHECK: Record<string, CheckId> = {
  // Images / media alternatives
  "image-alt": "img-alt",
  "input-image-alt": "img-alt",
  "svg-img-alt": "img-alt",
  "object-alt": "img-alt",
  "role-img-alt": "img-alt",
  "area-alt": "img-alt",
  "server-side-image-map": "img-alt",
  "image-redundant-alt": "img-alt",

  // Names
  "button-name": "button-name",
  "input-button-name": "button-name",
  "link-name": "anchor-name",
  "aria-command-name": "button-name",
  "aria-input-field-name": "input-label",
  "aria-toggle-field-name": "input-label",
  "aria-tooltip-name": "button-name",
  "aria-meter-name": "input-label",
  "aria-progressbar-name": "input-label",

  // Language
  "html-has-lang": "html-lang",
  "html-lang-valid": "html-lang-valid",
  "valid-lang": "lang-parts",
  "html-xml-lang-mismatch": "html-lang",

  // Focus / keyboard
  tabindex: "positive-tabindex",
  "scrollable-region-focusable": "keyboard-interaction",

  // Forms / labels
  label: "input-label",
  "select-name": "input-label",
  "form-field-multiple-labels": "input-label",
  "label-content-name-mismatch": "label-in-name",
  "label-title-only": "input-label",

  // Frames / media
  "frame-title": "iframe-title",
  "frame-title-unique": "iframe-title",
  "frame-tested": "frame-keyboard",
  "no-autoplay-audio": "autoplay-media",

  // IDs / headings
  "duplicate-id": "duplicate-id",
  "duplicate-id-active": "duplicate-id",
  "duplicate-id-aria": "duplicate-id",
  "empty-heading": "empty-heading",
  "heading-order": "heading-order",
  "page-has-heading-one": "page-heading",

  // ARIA
  "aria-hidden-focus": "aria-hidden-focusable",
  "aria-hidden-body": "aria-hidden-focusable",
  "aria-roles": "aria-role",
  "aria-allowed-role": "aria-role",
  "aria-deprecated-role": "aria-role",
  "aria-allowed-attr": "aria-props",
  "aria-valid-attr": "aria-props",
  "aria-valid-attr-value": "aria-props",
  "aria-prohibited-attr": "aria-props",
  "aria-unsupported-elements": "aria-props",
  "aria-required-attr": "aria-required-attr",
  "aria-required-children": "aria-required-attr",
  "aria-required-parent": "aria-required-attr",
  "aria-conditional-attr": "aria-required-attr",
  "aria-braille-equivalent": "aria-props",

  // Runtime-only / rendered
  "color-contrast": "color-contrast",
  "color-contrast-enhanced": "color-contrast-enhanced",
  "link-in-text-block": "use-of-color",
  "document-title": "document-title",
  bypass: "bypass",
  "skip-link": "bypass",
  accesskeys: "no-accesskey",
  "landmark-one-main": "landmark-one-main",
  "landmark-main-is-top-level": "landmark-one-main",
  "landmark-banner-is-top-level": "landmark-one-main",
  "landmark-contentinfo-is-top-level": "landmark-one-main",
  "landmark-no-duplicate-main": "landmark-one-main",
  "landmark-no-duplicate-banner": "landmark-unique",
  "landmark-no-duplicate-contentinfo": "landmark-unique",
  "nested-interactive": "nested-interactive",
  "target-size": "target-size",

  // Structure / zoom / autocomplete (new modeled checks)
  list: "list-structure",
  listitem: "list-structure",
  "definition-list": "list-structure",
  dlitem: "list-structure",
  "meta-viewport": "meta-viewport",
  "meta-viewport-large": "meta-viewport",
  "autocomplete-valid": "autocomplete-valid",

  // Promoted from already-detected axe rules (new modeled controls)
  "td-has-header": "table-headers",
  "th-has-data-cells": "table-headers",
  "td-headers-attr": "table-headers",
  "table-fake-caption": "table-caption",
  "table-duplicate-name": "table-caption",
  "scope-attr-valid": "table-headers",
  region: "content-region",
  "aria-roledescription": "aria-roledescription",
  "presentation-role-conflict": "presentation-role",
  "meta-refresh": "no-auto-refresh",
  "meta-refresh-no-exceptions": "no-auto-refresh",
  "css-orientation-lock": "no-orientation-lock",
  "landmark-unique": "landmark-unique",

  "video-caption": "video-caption",
  "audio-caption": "audio-caption",
  blink: "no-blink-marquee",
  marquee: "no-blink-marquee",
  "avoid-inline-spacing": "text-spacing",
  "empty-table-header": "empty-th",
  "aria-dialog-name": "dialog-name",
  "aria-tab-name": "tab-name",
  "summary-name": "summary-name",
  "frame-focusable-content": "frame-keyboard",
  "p-as-heading": "p-as-heading",
  "html-has-doctype": "doctype",

  "focus-order-semantics": "focus-order-logical",
  "identical-links-same-purpose": "identical-links-purpose",
  "hidden-content": "hidden-content",
};

/**
 * axe rules we will never emit. Best-practice / deprecated, no catalog control,
 * or a weaker duplicate of a mapped rule. Listed so they do not vanish silently.
 */
export const REJECTED_AXE_RULES: ReadonlySet<string> = new Set([
  "aria-text",
  "aria-treeitem-name",
  "landmark-complementary-is-top-level",
]);

export function checkIdForAxeRule(axeRuleId: string): CheckId | undefined {
  return AXE_TO_CHECK[axeRuleId];
}

/** Distinct catalog ids axe can emit. */
export function axeMappedCheckIds(): CheckId[] {
  return [...new Set(Object.values(AXE_TO_CHECK))];
}
