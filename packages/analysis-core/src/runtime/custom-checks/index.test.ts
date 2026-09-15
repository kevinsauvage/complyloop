import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import type { CustomViolation } from "./types";

const violation = (
  id: CustomViolation["id"],
  nodes: CustomViolation["nodes"] = [{ html: "<x/>", target: ["#x"] }],
): CustomViolation => ({
  id,
  impact: "serious",
  description: id,
  help: id,
  nodes,
});

const mocks = vi.hoisted(() => ({
  restorePageAfterMutatingProbes: vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
  textSpacingRuntimeViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  nonTextContrastViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  labelAdjacentViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  cssDisabledContentViolations: vi.fn<() => Promise<CustomViolation[]>>(),
  mediaKeyboardViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  cssHoverKeyboardViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  cssOffUnderstandableViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  layoutTableLinearizationViolation:
    vi.fn<() => Promise<CustomViolation | null>>(),
  errorPreventionViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  captchaAlternativeViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  accessibleAuthEnhancedViolation:
    vi.fn<() => Promise<CustomViolation | null>>(),
  mediaIdentificationViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  supplementaryContentKeyboardViolation:
    vi.fn<() => Promise<CustomViolation | null>>(),
  focusCustomViolations: vi.fn<() => Promise<CustomViolation[]>>(),
  dialogFocusViolations: vi.fn<() => Promise<CustomViolation[]>>(),
  widgetKeyboardViolations: vi.fn<() => Promise<CustomViolation[]>>(),
  formErrorSubmitViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  liveRegionUpdatesViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  hoverContentViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  forcedColorsViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  reducedMotionViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  reflowViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  resizeTextViolation: vi.fn<() => Promise<CustomViolation | null>>(),
  targetSizeEnhancedViolation: vi.fn<() => Promise<CustomViolation | null>>(),
}));

vi.mock("./page-restore.js", () => ({
  restorePageAfterMutatingProbes: mocks.restorePageAfterMutatingProbes,
}));
vi.mock("./text-spacing-runtime.js", () => ({
  textSpacingRuntimeViolation: mocks.textSpacingRuntimeViolation,
}));
vi.mock("./non-text-contrast.js", () => ({
  nonTextContrastViolation: mocks.nonTextContrastViolation,
}));
vi.mock("./label-adjacent.js", () => ({
  labelAdjacentViolation: mocks.labelAdjacentViolation,
}));
vi.mock("./css-disabled-content.js", () => ({
  cssDisabledContentViolations: mocks.cssDisabledContentViolations,
}));
vi.mock("./media-keyboard.js", () => ({
  mediaKeyboardViolation: mocks.mediaKeyboardViolation,
}));
vi.mock("./css-hover-keyboard.js", () => ({
  cssHoverKeyboardViolation: mocks.cssHoverKeyboardViolation,
}));
vi.mock("./css-off-understandable.js", () => ({
  cssOffUnderstandableViolation: mocks.cssOffUnderstandableViolation,
}));
vi.mock("./layout-table-linearization.js", () => ({
  layoutTableLinearizationViolation: mocks.layoutTableLinearizationViolation,
}));
vi.mock("./error-prevention.js", () => ({
  errorPreventionViolation: mocks.errorPreventionViolation,
}));
vi.mock("./captcha-alternative.js", () => ({
  captchaAlternativeViolation: mocks.captchaAlternativeViolation,
}));
vi.mock("./accessible-auth-enhanced.js", () => ({
  accessibleAuthEnhancedViolation: mocks.accessibleAuthEnhancedViolation,
}));
vi.mock("./media-identification.js", () => ({
  mediaIdentificationViolation: mocks.mediaIdentificationViolation,
}));
vi.mock("./supplementary-content-keyboard.js", () => ({
  supplementaryContentKeyboardViolation:
    mocks.supplementaryContentKeyboardViolation,
}));
vi.mock("./focus.js", () => ({
  focusCustomViolations: mocks.focusCustomViolations,
}));
vi.mock("./dialog-focus.js", () => ({
  dialogFocusViolations: mocks.dialogFocusViolations,
}));
vi.mock("./widget-keyboard.js", () => ({
  widgetKeyboardViolations: mocks.widgetKeyboardViolations,
}));
vi.mock("./form-error-submit.js", () => ({
  formErrorSubmitViolation: mocks.formErrorSubmitViolation,
}));
vi.mock("./live-region-updates.js", () => ({
  liveRegionUpdatesViolation: mocks.liveRegionUpdatesViolation,
}));
vi.mock("./hover-content.js", () => ({
  hoverContentViolation: mocks.hoverContentViolation,
}));
vi.mock("./forced-colors.js", () => ({
  forcedColorsViolation: mocks.forcedColorsViolation,
}));
vi.mock("./reduced-motion.js", () => ({
  reducedMotionViolation: mocks.reducedMotionViolation,
}));
vi.mock("./reflow.js", () => ({
  reflowViolation: mocks.reflowViolation,
}));
vi.mock("./resize-text.js", () => ({
  resizeTextViolation: mocks.resizeTextViolation,
}));
vi.mock("./target-size-enhanced.js", () => ({
  targetSizeEnhancedViolation: mocks.targetSizeEnhancedViolation,
}));

import { runCustomRuntimeChecks, runThemeSensitiveCustomChecks } from "./index";

const page = {} as Page;

describe("runCustomRuntimeChecks", () => {
  it("merges optional, composite, and sequential violations into findings", async () => {
    mocks.textSpacingRuntimeViolation.mockResolvedValue(null);
    mocks.nonTextContrastViolation.mockResolvedValue(null);
    mocks.labelAdjacentViolation.mockResolvedValue(violation("label-adjacent"));
    mocks.cssDisabledContentViolations.mockResolvedValue([
      violation("css-disabled-content"),
    ]);
    mocks.mediaKeyboardViolation.mockResolvedValue(null);
    mocks.cssHoverKeyboardViolation.mockResolvedValue(null);
    mocks.cssOffUnderstandableViolation.mockResolvedValue(null);
    mocks.layoutTableLinearizationViolation.mockResolvedValue(null);
    mocks.errorPreventionViolation.mockResolvedValue(null);
    mocks.captchaAlternativeViolation.mockResolvedValue(null);
    mocks.accessibleAuthEnhancedViolation.mockResolvedValue(null);
    mocks.mediaIdentificationViolation.mockResolvedValue(null);
    mocks.supplementaryContentKeyboardViolation.mockResolvedValue(null);
    mocks.focusCustomViolations.mockResolvedValue([violation("focus-visible")]);
    mocks.dialogFocusViolations.mockResolvedValue([
      violation("dialog-keyboard"),
    ]);
    mocks.widgetKeyboardViolations.mockResolvedValue([
      violation("tabs-keyboard"),
    ]);
    mocks.formErrorSubmitViolation.mockResolvedValue(null);
    mocks.liveRegionUpdatesViolation.mockResolvedValue(null);
    mocks.hoverContentViolation.mockResolvedValue(null);
    mocks.forcedColorsViolation.mockResolvedValue(violation("forced-colors"));
    mocks.reducedMotionViolation.mockResolvedValue(null);
    mocks.reflowViolation.mockResolvedValue(null);
    mocks.resizeTextViolation.mockResolvedValue(null);
    mocks.targetSizeEnhancedViolation.mockResolvedValue(null);

    const results = await runCustomRuntimeChecks(page, "https://app.example/");

    expect(results.findings.map((result) => result.checkId).sort()).toEqual([
      "css-disabled-content",
      "dialog-keyboard",
      "focus-visible",
      "forced-colors",
      "label-adjacent",
      "tabs-keyboard",
    ]);
    expect(
      results.findings.every(
        (result) => result.analyzerId === "playwright-custom",
      ),
    ).toBe(true);
    expect(results.probeFailures).toEqual([]);
    expect(mocks.restorePageAfterMutatingProbes).toHaveBeenCalledTimes(1);
  });

  it("contains a throwing probe and records it instead of aborting the audit (P2-5)", async () => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.restorePageAfterMutatingProbes.mockResolvedValue(undefined);
    for (const mock of [
      mocks.textSpacingRuntimeViolation,
      mocks.nonTextContrastViolation,
      mocks.labelAdjacentViolation,
      mocks.mediaKeyboardViolation,
      mocks.cssHoverKeyboardViolation,
      mocks.cssOffUnderstandableViolation,
      mocks.layoutTableLinearizationViolation,
      mocks.errorPreventionViolation,
      mocks.captchaAlternativeViolation,
      mocks.accessibleAuthEnhancedViolation,
      mocks.mediaIdentificationViolation,
      mocks.supplementaryContentKeyboardViolation,
      mocks.formErrorSubmitViolation,
      mocks.liveRegionUpdatesViolation,
      mocks.hoverContentViolation,
      mocks.reducedMotionViolation,
      mocks.reflowViolation,
      mocks.resizeTextViolation,
      mocks.targetSizeEnhancedViolation,
    ]) {
      mock.mockResolvedValue(null);
    }
    mocks.cssDisabledContentViolations.mockResolvedValue([]);
    mocks.focusCustomViolations.mockResolvedValue([]);
    mocks.dialogFocusViolations.mockResolvedValue([]);
    mocks.widgetKeyboardViolations.mockResolvedValue([]);
    // One flaky probe (e.g. frozen matchMedia emulation) throws.
    mocks.forcedColorsViolation.mockRejectedValue(new Error("evaluate hung"));
    mocks.labelAdjacentViolation.mockResolvedValue(violation("label-adjacent"));

    const results = await runCustomRuntimeChecks(page, "https://app.example/");

    expect(results.probeFailures).toEqual(["forced-colors"]);
    expect(results.findings.map((result) => result.checkId)).toEqual([
      "label-adjacent",
    ]);
  });
});

describe("runThemeSensitiveCustomChecks", () => {
  it("returns focus and contrast violations for the theme pass", async () => {
    mocks.focusCustomViolations.mockResolvedValue([violation("focus-visible")]);
    mocks.nonTextContrastViolation.mockResolvedValue(
      violation("non-text-contrast"),
    );

    const results = await runThemeSensitiveCustomChecks(
      page,
      "https://app.example/",
    );

    expect(results.findings.map((result) => result.checkId)).toEqual([
      "focus-visible",
      "non-text-contrast",
    ]);
    expect(results.probeFailures).toEqual([]);
  });

  it("omits contrast when the check is clean", async () => {
    mocks.focusCustomViolations.mockResolvedValue([]);
    mocks.nonTextContrastViolation.mockResolvedValue(null);

    const results = await runThemeSensitiveCustomChecks(
      page,
      "https://app.example/",
    );
    expect(results.findings).toEqual([]);
    expect(results.probeFailures).toEqual([]);
  });
});
