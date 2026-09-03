import type { Page } from "playwright";
import type { AxeViolationLike } from "../findings.js";
import { bothColorsRuntimeViolation } from "./both-colors-runtime.js";
import { cssDisabledContentViolations } from "./css-disabled-content.js";
import { cssForPresentationViolations } from "./css-for-presentation.js";
import { cssOffUnderstandableViolation } from "./css-off-understandable.js";
import { flashThresholdViolation } from "./flash-threshold.js";
import { errorPreventionViolation } from "./error-prevention.js";
import { captchaAlternativeViolation } from "./captcha-alternative.js";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced.js";
import { mediaIdentificationViolation } from "./media-identification.js";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard.js";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard.js";
import { layoutTableLinearizationViolation } from "./layout-table-linearization.js";
import { mediaAtCompatibleViolation } from "./media-at-compatible.js";
import { mediaKeyboardViolation } from "./media-keyboard.js";
import { focusCustomViolations } from "./focus.js";
import { focusOrderLogicalViolation } from "./focus-order-logical.js";
import { infoNotColorOnlyViolation } from "./info-not-color-only.js";
import { hoverContentViolation } from "./hover-content.js";
import { labelAdjacentViolation } from "./label-adjacent.js";
import { nonTextContrastViolation } from "./non-text-contrast.js";
import { forcedColorsViolation } from "./forced-colors.js";
import { reducedMotionViolation } from "./reduced-motion.js";
import { dialogFocusViolations } from "./dialog-focus.js";
import { announcementViolations } from "./announcement.js";
import { widgetKeyboardViolations } from "./widget-keyboard.js";
import { formErrorRuntimeViolation } from "./form-error-runtime.js";
import { reflowViolation } from "./reflow.js";
import { resizeTextViolation } from "./resize-text.js";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime.js";
import type { CustomViolation } from "./types.js";

function toAxeViolation(violation: CustomViolation): AxeViolationLike {
  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      html: node.html,
      target: node.target,
    })),
  };
}

/**
 * Playwright checks that axe does not cover.
 * Returns synthetic violations using complyloop-* ids mapped in axe-map.ts.
 */
export async function runCustomRuntimeChecks(
  page: Page,
): Promise<AxeViolationLike[]> {
  const optional = await Promise.all([
    reflowViolation(page),
    resizeTextViolation(page),
    textSpacingRuntimeViolation(page),
    nonTextContrastViolation(page),
    labelAdjacentViolation(page),
    hoverContentViolation(page),
    bothColorsRuntimeViolation(page),
    cssDisabledContentViolations(page),
    mediaKeyboardViolation(page),
    cssHoverKeyboardViolation(page),
    infoNotColorOnlyViolation(page),
    focusOrderLogicalViolation(page),
    cssOffUnderstandableViolation(page),
    layoutTableLinearizationViolation(page),
    mediaAtCompatibleViolation(page),
    flashThresholdViolation(page),
    errorPreventionViolation(page),
    captchaAlternativeViolation(page),
    accessibleAuthEnhancedViolation(page),
    mediaIdentificationViolation(page),
    supplementaryContentKeyboardViolation(page),
    announcementViolations(page),
    formErrorRuntimeViolation(page),
  ]);

  const violations: CustomViolation[] = [
    ...(await focusCustomViolations(page)),
    ...(await cssForPresentationViolations(page)),
    ...(await dialogFocusViolations(page)),
    ...(await widgetKeyboardViolations(page)),
  ];

  // reduced-motion temporarily emulates `prefers-reduced-motion`; run it
  // sequentially before the parallel batch so that emulation never races the
  // shared-page concurrency below (each check restores media features after).
  for (const emulated of [
    await forcedColorsViolation(page),
    await reducedMotionViolation(page),
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
