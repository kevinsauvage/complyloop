import { describe, expect, it } from "vitest";
import {
  isCompositionSensitiveCheck,
  isHeuristicCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
  keepOpenWhenRuntimeScanSkipped,
} from "./check-authority";

const COMPOSITION_SENSITIVE = [
  "input-label",
  "button-name",
  "anchor-name",
  "form-error-association",
  "heading-order",
  "empty-heading",
  "aria-hidden-focusable",
  "duplicate-id",
  "text-spacing",
] as const;

const RUNTIME_ONLY = [
  "color-contrast",
  "document-title",
  "bypass",
  "landmark-one-main",
  "nested-interactive",
  "target-size",
  "table-headers",
  "page-heading",
  "content-region",
  "label-in-name",
  "lang-parts",
  "aria-roledescription",
  "presentation-role",
  "no-auto-refresh",
  "no-orientation-lock",
  "landmark-unique",
  "use-of-color",
  "frame-keyboard",
  "doctype",
  "focus-visible",
  "keyboard-trap",
  "focus-not-obscured",
  "non-text-contrast",
  "reflow",
  "text-spacing-runtime",
  "label-adjacent",
  "resize-text",
  "css-hover-keyboard",
  "focus-order-logical",
  "focus-not-obscured-enhanced",
  "focus-appearance",
  "identical-links-purpose",
  "hidden-content",
  "css-for-presentation",
  "css-off-understandable",
  "layout-table-linearization",
  "error-prevention",
  "captcha-alternative",
  "accessible-auth-enhanced",
  "media-identification",
  "supplementary-content-keyboard",
  "color-contrast-enhanced",
  "consistent-landmarks",
  "duplicate-page-title",
] as const;

describe("check authority", () => {
  it("marks every composition-sensitive AST check", () => {
    for (const checkId of COMPOSITION_SENSITIVE) {
      expect(isCompositionSensitiveCheck(checkId)).toBe(true);
      expect(keepOpenWhenRuntimeScanSkipped(checkId)).toBe(true);
    }
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
    expect(isCompositionSensitiveCheck("color-contrast")).toBe(false);
  });

  it("marks every rendered-page-only check", () => {
    for (const checkId of RUNTIME_ONLY) {
      expect(isRuntimeOnlyCheck(checkId)).toBe(true);
      expect(keepOpenWhenRuntimeScanSkipped(checkId)).toBe(true);
    }
    expect(isRuntimeOnlyCheck("img-alt")).toBe(false);
    expect(isRuntimeOnlyCheck("input-label")).toBe(false);
  });

  it("keeps runtime findings open only for authority-gated ids", () => {
    expect(keepOpenWhenRuntimeScanSkipped("color-contrast")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("input-label")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("empty-heading")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("target-size")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("img-alt")).toBe(false);
  });

  it("marks source package twins without changing authority class", () => {
    expect(isPackageTwinSourceCheck("img-alt")).toBe(true);
    expect(isPackageTwinSourceCheck("video-caption")).toBe(true);
    expect(isPackageTwinSourceCheck("meta-viewport")).toBe(true);
    expect(isPackageTwinSourceCheck("fieldset-legend")).toBe(false);
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
  });

  it("does not treat heuristic AST checks as a pass when they emit nothing", () => {
    expect(isHeuristicCheck("image-of-text")).toBe(true);
    expect(isHeuristicCheck("link-explicit-heuristic")).toBe(true);
    expect(isHeuristicCheck("audio-description-track")).toBe(true);
    expect(isHeuristicCheck("audio-description-or-alt")).toBe(true);
    expect(isHeuristicCheck("lang-change")).toBe(true);
    expect(isHeuristicCheck("cryptic-content-alt")).toBe(true);
    expect(isHeuristicCheck("error-prevention")).toBe(true);
    expect(isHeuristicCheck("reduced-motion")).toBe(true);
    expect(isHeuristicCheck("accessible-auth-enhanced")).toBe(true);
    expect(isHeuristicCheck("blockquote-cite")).toBe(false);
    expect(isHeuristicCheck("img-alt")).toBe(false);
    expect(keepOpenWhenRuntimeScanSkipped("image-of-text")).toBe(false);
    expect(isRuntimeOnlyCheck("duplicate-page-title")).toBe(true);
  });
});
