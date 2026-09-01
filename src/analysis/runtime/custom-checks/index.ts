import type { Page } from "playwright";
import type { AxeViolationLike } from "../findings";
import { bothColorsRuntimeViolation } from "./both-colors-runtime";
import { cssDisabledContentViolation } from "./css-disabled-content";
import { mediaKeyboardViolation } from "./media-keyboard";
import { focusCustomViolations } from "./focus";
import { hoverContentViolation } from "./hover-content";
import { labelAdjacentViolation } from "./label-adjacent";
import { nonTextContrastViolation } from "./non-text-contrast";
import { reflowViolation } from "./reflow";
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
    textSpacingRuntimeViolation(page),
    nonTextContrastViolation(page),
    labelAdjacentViolation(page),
    hoverContentViolation(page),
    bothColorsRuntimeViolation(page),
    cssDisabledContentViolation(page),
    mediaKeyboardViolation(page),
  ]);

  const violations: CustomViolation[] = [
    ...(await focusCustomViolations(page)),
    ...optional.filter((result): result is CustomViolation => result !== null),
  ];

  return violations.map(toAxeViolation);
}
