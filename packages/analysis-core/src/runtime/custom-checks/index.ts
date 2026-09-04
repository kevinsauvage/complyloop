import type { Page } from "playwright";
import type { AxeViolationLike } from "../findings.ts";
import { cssDisabledContentViolations } from "./css-disabled-content.ts";
import { cssOffUnderstandableViolation } from "./css-off-understandable.ts";
import { errorPreventionViolation } from "./error-prevention.ts";
import { captchaAlternativeViolation } from "./captcha-alternative.ts";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced.ts";
import { mediaIdentificationViolation } from "./media-identification.ts";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard.ts";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard.ts";
import { layoutTableLinearizationViolation } from "./layout-table-linearization.ts";
import { mediaKeyboardViolation } from "./media-keyboard.ts";
import { focusCustomViolations } from "./focus.ts";
import { labelAdjacentViolation } from "./label-adjacent.ts";
import { nonTextContrastViolation } from "./non-text-contrast.ts";
import { targetSizeEnhancedViolation } from "./target-size-enhanced.ts";
import { hoverContentViolation } from "./hover-content.ts";
import { liveRegionUpdatesViolation } from "./live-region-updates.ts";
import { formErrorSubmitViolation } from "./form-error-submit.ts";
import { forcedColorsViolation } from "./forced-colors.ts";
import { reducedMotionViolation } from "./reduced-motion.ts";
import { dialogFocusViolations } from "./dialog-focus.ts";
import { widgetKeyboardViolations } from "./widget-keyboard.ts";
import { restorePageAfterMutatingProbes } from "./page-restore.ts";
import { reflowViolation } from "./reflow.ts";
import { resizeTextViolation } from "./resize-text.ts";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime.ts";
import type { CustomViolation } from "./types.ts";

function toAxeViolation(violation: CustomViolation): AxeViolationLike {
  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      html: node.html,
      target: node.target,
      ...(node.failureSummary ? { failureSummary: node.failureSummary } : {}),
    })),
  };
}

/**
 * Playwright checks that axe / html-validate do not cover.
 * Returns synthetic violations using complyloop-* ids mapped in axe-map.ts.
 */
export async function runCustomRuntimeChecks(
  page: Page,
): Promise<AxeViolationLike[]> {
  const optional = await Promise.all([
    textSpacingRuntimeViolation(page),
    nonTextContrastViolation(page),
    labelAdjacentViolation(page),
    cssDisabledContentViolations(page),
    mediaKeyboardViolation(page),
    cssHoverKeyboardViolation(page),
    layoutTableLinearizationViolation(page),
    errorPreventionViolation(page),
    captchaAlternativeViolation(page),
    accessibleAuthEnhancedViolation(page),
    mediaIdentificationViolation(page),
    supplementaryContentKeyboardViolation(page),
  ]);

  const violations: CustomViolation[] = [
    ...(await focusCustomViolations(page)),
    ...(await dialogFocusViolations(page)),
    ...(await widgetKeyboardViolations(page)),
  ];

  // css-off restores styles in-page; form submit, live-region, and hover mutate
  // DOM state — reload before media/viewport probes so later checks stay clean.
  for (const mutating of [
    await cssOffUnderstandableViolation(page),
    await formErrorSubmitViolation(page),
    await liveRegionUpdatesViolation(page),
    await hoverContentViolation(page),
  ]) {
    if (mutating) violations.push(mutating);
  }
  await restorePageAfterMutatingProbes(page);

  for (const emulated of [
    await forcedColorsViolation(page),
    await reducedMotionViolation(page),
    await reflowViolation(page),
    await resizeTextViolation(page),
    await targetSizeEnhancedViolation(page),
  ]) {
    if (emulated) violations.push(emulated);
  }

  violations.push(
    ...optional.flatMap((result) => {
      if (result === null) return [];
      if (Array.isArray(result)) return result;
      return [result];
    }),
  );

  return violations.map(toAxeViolation);
}

/**
 * Theme-sensitive subset of the custom checks, for the browser-condition
 * (color-scheme) pass. These are the checks whose outcome can genuinely change
 * under dark/light emulation; everything else is condition-neutral.
 */
export async function runThemeSensitiveCustomChecks(
  page: Page,
): Promise<AxeViolationLike[]> {
  const theme: CustomViolation[] = [...(await focusCustomViolations(page))];
  const contrast = await nonTextContrastViolation(page);
  if (contrast) theme.push(contrast);
  return theme.map(toAxeViolation);
}
