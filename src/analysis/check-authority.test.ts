import { describe, expect, it } from "vitest";
import {
  isCompositionSensitiveCheck,
  isRuntimeOnlyCheck,
  keepOpenWhenRuntimeScanSkipped,
} from "./check-authority";

describe("check authority", () => {
  it("marks composition-sensitive AST checks", () => {
    expect(isCompositionSensitiveCheck("input-label")).toBe(true);
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
    expect(isCompositionSensitiveCheck("color-contrast")).toBe(false);
  });

  it("marks rendered-page-only checks", () => {
    expect(isRuntimeOnlyCheck("color-contrast")).toBe(true);
    expect(isRuntimeOnlyCheck("document-title")).toBe(true);
    expect(isRuntimeOnlyCheck("img-alt")).toBe(false);
  });

  it("keeps runtime findings open when the runtime scan did not run", () => {
    expect(keepOpenWhenRuntimeScanSkipped("color-contrast")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("input-label")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("img-alt")).toBe(false);
  });
});
