import type { CheckId } from "../types";

/**
 * Maps axe-core rule ids to ComplyLoop check ids.
 * Unmapped axe rules are ignored (we only status controls we model).
 */
const AXE_TO_CHECK: Record<string, CheckId> = {
  "image-alt": "img-alt",
  "input-image-alt": "img-alt",
  "button-name": "button-name",
  "link-name": "anchor-name",
  "html-has-lang": "html-lang",
  "html-lang-valid": "html-lang",
  tabindex: "positive-tabindex",
  label: "input-label",
  "select-name": "input-label",
  "frame-title": "iframe-title",
  "video-caption": "autoplay-media",
  "audio-caption": "autoplay-media",
  "duplicate-id": "duplicate-id",
  "duplicate-id-active": "duplicate-id",
  "duplicate-id-aria": "duplicate-id",
  "empty-heading": "empty-heading",
  "heading-order": "heading-order",
  "aria-hidden-focus": "aria-hidden-focusable",
  "form-field-multiple-labels": "input-label",
};

export function checkIdForAxeRule(axeRuleId: string): CheckId | undefined {
  return AXE_TO_CHECK[axeRuleId];
}
