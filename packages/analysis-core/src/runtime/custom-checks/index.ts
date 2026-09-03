import type { Page } from "playwright";
import type { AxeViolationLike } from "../findings.js";
import { cssDisabledContentViolations } from "./css-disabled-content.js";
import { cssOffUnderstandableViolation } from "./css-off-understandable.js";
import { errorPreventionViolation } from "./error-prevention.js";
import { captchaAlternativeViolation } from "./captcha-alternative.js";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced.js";
import { mediaIdentificationViolation } from "./media-identification.js";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard.js";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard.js";
import { layoutTableLinearizationViolation } from "./layout-table-linearization.js";
import { mediaKeyboardViolation } from "./media-keyboard.js";
import { focusCustomViolations } from "./focus.js";
import { labelAdjacentViolation } from "./label-adjacent.js";
import { nonTextContrastViolation } from "./non-text-contrast.js";
import { formErrorSubmitViolation } from "./form-error-submit.js";
import { forcedColorsViolation } from "./forced-colors.js";
import { reducedMotionViolation } from "./reduced-motion.js";
import { dialogFocusViolations } from "./dialog-focus.js";
import { widgetKeyboardViolations } from "./widget-keyboard.js";
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
    cssOffUnderstandableViolation(page),
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

  // Form submit, reduced-motion, and forced-colors mutate page state or
  // emulate media; run sequentially so they never race the shared-page batch
  // (each check restores state after). Viewport-mutating checks (reflow,
  // 200% resize) belong on the same sequential path.
  for (const emulated of [
    await formErrorSubmitViolation(page),
    await forcedColorsViolation(page),
    await reducedMotionViolation(page),
    await reflowViolation(page),
    await resizeTextViolation(page),
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
