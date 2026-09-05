import type { Page } from "playwright";
import { HEURISTIC_RUNTIME_DOWNGRADE, isHeuristicCheck } from "../../check-authority.ts";
import type { RawFinding } from "../../types.ts";
import { htmlSnippet, selectorFromTarget } from "../dom-location.ts";
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

export { customProbeCheckIds } from "./types.ts";

export function findingsFromCustomViolations(
  pageUrl: string,
  violations: ReadonlyArray<CustomViolation>,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const violation of violations) {
    const downgrade = isHeuristicCheck(violation.id)
      ? HEURISTIC_RUNTIME_DOWNGRADE
      : undefined;
    for (const node of violation.nodes) {
      findings.push({
        checkId: violation.id,
        kind: downgrade?.kind ?? "violation",
        severity: downgrade?.severity ?? violation.impact,
        confidence: downgrade?.confidence ?? "high",
        reason: `${violation.help} ${violation.description}`.trim(),
        location: {
          kind: "dom",
          url: pageUrl,
          selector: selectorFromTarget(node.target),
          snippet: htmlSnippet(node.html),
          elementLabel: node.elementLabel,
          context: node.failureSummary,
        },
        fix: null,
        engine: "runtime",
        analyzerId: "playwright-custom",
        analyzerRuleId: violation.id,
      });
    }
  }
  return findings;
}

export interface CustomChecksResult {
  findings: RawFinding[];
  /**
   * Probe ids that threw. Per-probe containment contract (P2-5): a flaky
   * probe (frozen matchMedia emulation, a page that hangs an evaluate) must
   * not abort the rest of the runtime pass — the failure is recorded on the
   * audit result instead, mirroring the html-validate treatment in scan.ts.
   */
  probeFailures: string[];
}

type ProbeResult = CustomViolation | CustomViolation[] | null;

async function runProbe(
  failures: string[],
  probeId: string,
  probe: () => Promise<ProbeResult>,
): Promise<CustomViolation[]> {
  try {
    const result = await probe();
    if (result === null) return [];
    return Array.isArray(result) ? result : [result];
  } catch {
    failures.push(probeId);
    return [];
  }
}

async function collectCustomViolations(
  page: Page,
): Promise<{ violations: CustomViolation[]; probeFailures: string[] }> {
  const probeFailures: string[] = [];
  const guarded = (
    probeId: string,
    probe: () => Promise<ProbeResult>,
  ): Promise<CustomViolation[]> => runProbe(probeFailures, probeId, probe);

  const optional = await Promise.all([
    guarded("text-spacing-runtime", () => textSpacingRuntimeViolation(page)),
    guarded("non-text-contrast", () => nonTextContrastViolation(page)),
    guarded("label-adjacent", () => labelAdjacentViolation(page)),
    guarded("css-disabled-content", () => cssDisabledContentViolations(page)),
    guarded("media-keyboard", () => mediaKeyboardViolation(page)),
    guarded("css-hover-keyboard", () => cssHoverKeyboardViolation(page)),
    guarded("layout-table-linearization", () =>
      layoutTableLinearizationViolation(page),
    ),
    guarded("error-prevention", () => errorPreventionViolation(page)),
    guarded("captcha-alternative", () => captchaAlternativeViolation(page)),
    guarded("accessible-auth-enhanced", () =>
      accessibleAuthEnhancedViolation(page),
    ),
    guarded("media-identification", () => mediaIdentificationViolation(page)),
    guarded("supplementary-content-keyboard", () =>
      supplementaryContentKeyboardViolation(page),
    ),
  ]);

  const violations: CustomViolation[] = [
    ...(await guarded("focus", () => focusCustomViolations(page))),
    ...(await guarded("dialog-focus", () => dialogFocusViolations(page))),
    ...(await guarded("widget-keyboard", () => widgetKeyboardViolations(page))),
  ];

  // css-off restores styles in-page; form submit, live-region, and hover mutate
  // DOM state — reload before media/viewport probes so later checks stay clean.
  violations.push(
    ...(await guarded("css-off-understandable", () =>
      cssOffUnderstandableViolation(page),
    )),
    ...(await guarded("form-error-submit", () => formErrorSubmitViolation(page))),
    ...(await guarded("live-region-updates", () =>
      liveRegionUpdatesViolation(page),
    )),
    ...(await guarded("hover-content", () => hoverContentViolation(page))),
  );
  await restorePageAfterMutatingProbes(page);

  violations.push(
    ...(await guarded("forced-colors", () => forcedColorsViolation(page))),
    ...(await guarded("reduced-motion", () => reducedMotionViolation(page))),
    ...(await guarded("reflow", () => reflowViolation(page))),
    ...(await guarded("resize-text", () => resizeTextViolation(page))),
    ...(await guarded("target-size-enhanced", () =>
      targetSizeEnhancedViolation(page),
    )),
  );

  violations.push(...optional.flat());

  return { violations, probeFailures };
}

/** Playwright checks that axe / html-validate do not cover. */
export async function runCustomRuntimeChecks(
  page: Page,
  pageUrl: string,
): Promise<CustomChecksResult> {
  const { violations, probeFailures } = await collectCustomViolations(page);
  return {
    findings: findingsFromCustomViolations(pageUrl, violations),
    probeFailures,
  };
}

/**
 * Theme-sensitive subset of the custom checks, for the browser-condition
 * (color-scheme) pass. These are the checks whose outcome can genuinely change
 * under dark/light emulation; everything else is condition-neutral.
 */
export async function runThemeSensitiveCustomChecks(
  page: Page,
  pageUrl: string,
): Promise<CustomChecksResult> {
  const probeFailures: string[] = [];
  const theme: CustomViolation[] = [
    ...(await runProbe(probeFailures, "focus", () => focusCustomViolations(page))),
    ...(await runProbe(probeFailures, "non-text-contrast", () =>
      nonTextContrastViolation(page),
    )),
  ];
  return {
    findings: findingsFromCustomViolations(pageUrl, theme),
    probeFailures,
  };
}
