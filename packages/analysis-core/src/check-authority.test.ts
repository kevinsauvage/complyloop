import { describe, expect, it } from "vitest";
import {
  authorityForCheck,
  isCompositionSensitiveCheck,
  isHeuristicCheck,
  isHtmlValidateOwnedCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
  isSiteLevelCheck,
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
  "supplementary-content-keyboard",
  "color-contrast-enhanced",
  "consistent-landmarks",
  "duplicate-page-title",
  "markup-nesting",
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
    expect(keepOpenWhenRuntimeScanSkipped("target-size-enhanced")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("forced-colors")).toBe(true);
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
    expect(isHeuristicCheck("hover-content")).toBe(true);
    expect(isHeuristicCheck("label-adjacent")).toBe(true);
    expect(isHeuristicCheck("captcha-alternative")).toBe(true);
    expect(isHeuristicCheck("media-identification")).toBe(true);
    expect(isHeuristicCheck("layout-table-linearization")).toBe(true);
    expect(isHeuristicCheck("live-region-updates")).toBe(true);
    expect(isRuntimeOnlyCheck("captcha-alternative")).toBe(false);
    expect(isRuntimeOnlyCheck("hover-content")).toBe(false);
    expect(isHeuristicCheck("blockquote-cite")).toBe(false);
    expect(isHeuristicCheck("img-alt")).toBe(false);
    expect(keepOpenWhenRuntimeScanSkipped("image-of-text")).toBe(false);
    expect(isRuntimeOnlyCheck("duplicate-page-title")).toBe(true);
  });

  it("classifies with site_level → runtime_only → heuristic → composition_sensitive → standard", () => {
    expect(isSiteLevelCheck("consistent-nav")).toBe(true);
    expect(isRuntimeOnlyCheck("consistent-nav")).toBe(true);
    expect(authorityForCheck("consistent-nav")).toBe("site_level");

    expect(isSiteLevelCheck("consistent-lang")).toBe(true);
    expect(isRuntimeOnlyCheck("consistent-lang")).toBe(false);
    expect(authorityForCheck("consistent-lang")).toBe("site_level");

    expect(isRuntimeOnlyCheck("label-adjacent")).toBe(true);
    expect(isHeuristicCheck("label-adjacent")).toBe(true);
    expect(authorityForCheck("label-adjacent")).toBe("runtime_only");

    expect(authorityForCheck("color-contrast")).toBe("runtime_only");
    expect(authorityForCheck("image-of-text")).toBe("heuristic");
    expect(authorityForCheck("input-label")).toBe("composition_sensitive");
    expect(authorityForCheck("img-alt")).toBe("standard");
  });

  it("never returns a lower class when a higher list also contains the id", () => {
    const dualListed = [
      "consistent-nav",
      "consistent-labels",
      "label-adjacent",
    ] as const;
    for (const checkId of dualListed) {
      const authority = authorityForCheck(checkId);
      if (isSiteLevelCheck(checkId)) {
        expect(authority).toBe("site_level");
      } else if (isRuntimeOnlyCheck(checkId)) {
        expect(authority).toBe("runtime_only");
      }
    }
  });

  it("marks html-validate-owned check ids", () => {
    expect(isHtmlValidateOwnedCheck("markup-nesting")).toBe(true);
    expect(isHtmlValidateOwnedCheck("css-for-presentation")).toBe(true);
    expect(isHtmlValidateOwnedCheck("img-alt")).toBe(false);
  });
});
