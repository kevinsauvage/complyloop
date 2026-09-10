import type { Page } from "playwright";
import { HEURISTIC_RUNTIME_DOWNGRADE, isHeuristicCheck } from "../../check-authority.ts";
import type { RawFinding } from "../../types.ts";
import { htmlSnippet, selectorFromTarget } from "../dom-location.ts";
import { rawFindingFromDom } from "../raw-finding-from-dom.ts";
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
      findings.push(
        rawFindingFromDom({
          checkId: violation.id,
          kind: downgrade?.kind ?? "violation",
          severity: downgrade?.severity ?? violation.impact,
          confidence: downgrade?.confidence ?? "high",
          reason: `${violation.help} ${violation.description}`.trim(),
          url: pageUrl,
          selector: selectorFromTarget(node.target),
          snippet: htmlSnippet(node.html),
          elementLabel: node.elementLabel,
          context: node.failureSummary,
          analyzerId: "playwright-custom",
          analyzerRuleId: violation.id,
        }),
      );
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

interface GuardedProbe {
  id: string;
  run: (page: Page) => Promise<ProbeResult>;
}

async function runProbe(
  failures: string[],
  probeId: string,
  probe: () => Promise<ProbeResult>,
): Promise<CustomViolation[]> {
  try {
    const result = await probe();
    if (result == null) return [];
    return Array.isArray(result) ? result : [result];
  } catch {
    failures.push(probeId);
    return [];
  }
}

/** Condition-neutral probes — safe to run concurrently. */
const PARALLEL_PROBES: readonly GuardedProbe[] = [
  { id: "text-spacing-runtime", run: (page) => textSpacingRuntimeViolation(page) },
  { id: "non-text-contrast", run: (page) => nonTextContrastViolation(page) },
  { id: "label-adjacent", run: (page) => labelAdjacentViolation(page) },
  { id: "css-disabled-content", run: (page) => cssDisabledContentViolations(page) },
  { id: "media-keyboard", run: (page) => mediaKeyboardViolation(page) },
  { id: "css-hover-keyboard", run: (page) => cssHoverKeyboardViolation(page) },
  {
    id: "layout-table-linearization",
    run: (page) => layoutTableLinearizationViolation(page),
  },
  { id: "error-prevention", run: (page) => errorPreventionViolation(page) },
  { id: "captcha-alternative", run: (page) => captchaAlternativeViolation(page) },
  {
    id: "accessible-auth-enhanced",
    run: (page) => accessibleAuthEnhancedViolation(page),
  },
  { id: "media-identification", run: (page) => mediaIdentificationViolation(page) },
  {
    id: "supplementary-content-keyboard",
    run: (page) => supplementaryContentKeyboardViolation(page),
  },
];

/**
 * Mutating probes. css-off restores styles in-page; form submit, live-region,
 * and hover mutate DOM state — run sequentially, then reload before the
 * viewport probes so later checks stay clean.
 */
const INTERACTION_PROBES: readonly GuardedProbe[] = [
  { id: "focus", run: (page) => focusCustomViolations(page) },
  { id: "dialog-focus", run: (page) => dialogFocusViolations(page) },
  { id: "widget-keyboard", run: (page) => widgetKeyboardViolations(page) },
  { id: "css-off-understandable", run: (page) => cssOffUnderstandableViolation(page) },
  { id: "form-error-submit", run: (page) => formErrorSubmitViolation(page) },
  { id: "live-region-updates", run: (page) => liveRegionUpdatesViolation(page) },
  { id: "hover-content", run: (page) => hoverContentViolation(page) },
];

const VIEWPORT_PROBES: readonly GuardedProbe[] = [
  { id: "forced-colors", run: (page) => forcedColorsViolation(page) },
  { id: "reduced-motion", run: (page) => reducedMotionViolation(page) },
  { id: "reflow", run: (page) => reflowViolation(page) },
  { id: "resize-text", run: (page) => resizeTextViolation(page) },
  { id: "target-size-enhanced", run: (page) => targetSizeEnhancedViolation(page) },
];

async function collectCustomViolations(
  page: Page,
): Promise<{ violations: CustomViolation[]; probeFailures: string[] }> {
  const probeFailures: string[] = [];
  const run = (probe: GuardedProbe): Promise<CustomViolation[]> =>
    runProbe(probeFailures, probe.id, () => probe.run(page));

  const optional = await Promise.all(PARALLEL_PROBES.map(run));

  const violations: CustomViolation[] = [];
  for (const probe of INTERACTION_PROBES) {
    violations.push(...(await run(probe)));
  }
  await restorePageAfterMutatingProbes(page);
  for (const probe of VIEWPORT_PROBES) {
    violations.push(...(await run(probe)));
  }

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
