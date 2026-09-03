import type { AxeViolationLike } from "./findings.js";

/**
 * Browser-condition (color scheme) analysis — dark/light (§4).
 *
 * A page is not "tested" because it passed in one default browser state. The
 * useful abstraction is *same requirement, different browser condition,
 * different observed evidence*: a focus indicator or border that is visible in
 * light mode can vanish under `prefers-color-scheme: dark` when the site has
 * not adapted. This is not a generic theme differ ("the dark theme has 17 CSS
 * differences") — it surfaces findings that only fail in a specific condition.
 *
 * Only axe rules and custom checks whose outcome can depend on the color
 * scheme are re-run under the condition; everything else is condition-neutral
 * and would only add noise.
 */

/** Browser conditions a scan can re-audit theme-sensitive checks under. */
export type BrowserCondition = "dark" | "light" | "more-contrast";

/** Human-readable label shown on condition-specific findings. */
export function conditionLabel(condition: BrowserCondition): string {
  switch (condition) {
    case "dark":
      return "dark";
    case "light":
      return "light";
    case "more-contrast":
      return "prefers-contrast: more";
  }
}

/**
 * Playwright media-emulation options that reproduce the requested condition.
 * Exposed so callers reset both axes (color-scheme and contrast) afterwards.
 */
export function emulationForCondition(condition: BrowserCondition): {
  colorScheme?: "dark" | "light";
  contrast?: "more";
} {
  switch (condition) {
    case "dark":
      return { colorScheme: "dark" };
    case "light":
      return { colorScheme: "light" };
    case "more-contrast":
      return { contrast: "more" };
  }
}

/** Both axes are reset in the scanner's `finally` after each condition. */
export const RESET_EMULATION: { colorScheme: null; contrast: null } = {
  colorScheme: null,
  contrast: null,
};

/** axe rules whose outcome can change with the active color scheme. */
export const THEME_SENSITIVE_AXE_RULES: ReadonlySet<string> = new Set([
  "color-contrast",
  "color-contrast-enhanced",
  "use-of-color",
]);

/** Identity of a violation: rule id + first target selector. */
export function violationKey(violation: AxeViolationLike): string {
  const target = (violation.nodes[0] && violation.nodes[0]?.target[0]) || "";
  return `${violation.id}::${target}`;
}

/**
 * Returns the violations observed under a browser condition that were NOT seen
 * in the baseline (default) pass — the findings that only fail in one state.
 * Each returned violation's description is prefixed so the evidence says which
 * condition produced it.
 */
export function conditionSpecificViolations(
  baseline: ReadonlyArray<AxeViolationLike>,
  condition: ReadonlyArray<AxeViolationLike>,
  conditionLabel: string,
): AxeViolationLike[] {
  const baselineKeys = new Set(baseline.map(violationKey));
  const seen = new Set<string>();
  const specific: AxeViolationLike[] = [];

  for (const violation of condition) {
    const key = violationKey(violation);
    if (baselineKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    specific.push({
      ...violation,
      description: `[${conditionLabel} only] ${violation.description}`,
    });
  }
  return specific;
}