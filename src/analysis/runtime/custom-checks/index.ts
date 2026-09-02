import type { Page } from "playwright";
import type { AxeViolationLike } from "../findings";
import { bothColorsRuntimeViolation } from "./both-colors-runtime";
import { cssDisabledContentViolations } from "./css-disabled-content";
import { cssForPresentationViolations } from "./css-for-presentation";
import { cssOffUnderstandableViolation } from "./css-off-understandable";
import { flashThresholdViolation } from "./flash-threshold";
import { errorPreventionViolation } from "./error-prevention";
import { captchaAlternativeViolation } from "./captcha-alternative";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced";
import { mediaIdentificationViolation } from "./media-identification";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard";
import { layoutTableLinearizationViolation } from "./layout-table-linearization";
import { mediaAtCompatibleViolation } from "./media-at-compatible";
import { mediaKeyboardViolation } from "./media-keyboard";
import { focusCustomViolations } from "./focus";
import { focusOrderLogicalViolation } from "./focus-order-logical";
import { infoNotColorOnlyViolation } from "./info-not-color-only";
import { hoverContentViolation } from "./hover-content";
import { labelAdjacentViolation } from "./label-adjacent";
import { nonTextContrastViolation } from "./non-text-contrast";
import { reflowViolation } from "./reflow";
import { resizeTextViolation } from "./resize-text";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime";
import type { CustomViolation } from "./types";

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
  ]);

  const violations: CustomViolation[] = [
    ...(await focusCustomViolations(page)),
    ...(await cssForPresentationViolations(page)),
    ...optional.flatMap((result) => {
      if (result === null) return [];
      if (Array.isArray(result)) return result;
      return [result];
    }),
  ];

  return violations.map(toAxeViolation);
}
