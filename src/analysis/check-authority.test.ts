import { describe, expect, it } from "vitest";
import {
  isCompositionSensitiveCheck,
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
});
