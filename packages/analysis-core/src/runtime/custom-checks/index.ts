import type { Page } from "playwright-core";

import {
  HEURISTIC_RUNTIME_DOWNGRADE,
  isHeuristicCheck,
} from "../../check-authority.ts";
import type { RawFinding } from "../../types.ts";
import { htmlSnippet, selectorFromTarget } from "../dom-location.ts";
import { rawFindingFromDom } from "../raw-finding-from-dom.ts";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced.ts";
import { captchaAlternativeViolation } from "./captcha-alternative.ts";
import { cssDisabledContentViolations } from "./css-disabled-content.ts";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard.ts";
import { cssOffUnderstandableViolation } from "./css-off-understandable.ts";
import { dialogFocusViolations } from "./dialog-focus.ts";
import { errorPreventionViolation } from "./error-prevention.ts";
import { focusCustomViolations } from "./focus.ts";
import { forcedColorsViolation } from "./forced-colors.ts";
import { formErrorSubmitViolation } from "./form-error-submit.ts";
import { hoverContentViolation } from "./hover-content.ts";
import { labelAdjacentViolation } from "./label-adjacent.ts";
import { layoutTableLinearizationViolation } from "./layout-table-linearization.ts";
import { liveRegionUpdatesViolation } from "./live-region-updates.ts";
import { mediaIdentificationViolation } from "./media-identification.ts";
import { mediaKeyboardViolation } from "./media-keyboard.ts";
import { nonTextContrastViolation } from "./non-text-contrast.ts";
import { restorePageAfterMutatingProbes } from "./page-restore.ts";
import { reducedMotionViolation } from "./reduced-motion.ts";
import { reflowViolation } from "./reflow.ts";
import { resizeTextViolation } from "./resize-text.ts";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard.ts";
import { targetSizeEnhancedViolation } from "./target-size-enhanced.ts";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime.ts";
import type { CustomViolation } from "./types.ts";
import { widgetKeyboardViolations } from "./widget-keyboard.ts";

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

/**
 * Upper bound per probe (P2-5 containment): a probe that hangs — a page that
 * never settles an evaluate — is recorded in `probeFailures` instead of
 * stalling the whole runtime pass until the function is killed.
 */
const PROBE_TIMEOUT_MS = 60_000;

async function runProbe(
  failures: string[],
  probeId: string,
  probe: () => Promise<ProbeResult>,
): Promise<CustomViolation[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      probe(),
      new Promise<ProbeResult>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`probe timed out: ${probeId}`)),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    if (result == null) return [];
    return Array.isArray(result) ? result : [result];
  } catch {
    failures.push(probeId);
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Pristine-page reset between probes. Probes used to run concurrently while
 * mutating shared page state (hover, focus, injected styles, zoom), so each
 * probe measured the others' transient state and verdicts depended on
 * CPU-speed interleaving — stable per environment, divergent across them.
 * Every probe now starts from blur + top + neutral pointer.
 */
async function quiescePageForProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    window.scrollTo(0, 0);
  });
  await page.mouse.move(0, 0);
}

/** Measurement probes — sequential with a quiesce step, never concurrent. */
const MEASUREMENT_PROBES: readonly GuardedProbe[] = [
  {
    id: "text-spacing-runtime",
    run: (page) => textSpacingRuntimeViolation(page),
  },
  { id: "non-text-contrast", run: (page) => nonTextContrastViolation(page) },
  { id: "label-adjacent", run: (page) => labelAdjacentViolation(page) },
  {
    id: "css-disabled-content",
    run: (page) => cssDisabledContentViolations(page),
  },
  { id: "media-keyboard", run: (page) => mediaKeyboardViolation(page) },
  { id: "css-hover-keyboard", run: (page) => cssHoverKeyboardViolation(page) },
  {
    id: "layout-table-linearization",
    run: (page) => layoutTableLinearizationViolation(page),
  },
  { id: "error-prevention", run: (page) => errorPreventionViolation(page) },
  {
    id: "captcha-alternative",
    run: (page) => captchaAlternativeViolation(page),
  },
  {
    id: "accessible-auth-enhanced",
    run: (page) => accessibleAuthEnhancedViolation(page),
  },
  {
    id: "media-identification",
    run: (page) => mediaIdentificationViolation(page),
  },
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
  {
    id: "css-off-understandable",
    run: (page) => cssOffUnderstandableViolation(page),
  },
  { id: "form-error-submit", run: (page) => formErrorSubmitViolation(page) },
  {
    id: "live-region-updates",
    run: (page) => liveRegionUpdatesViolation(page),
  },
  { id: "hover-content", run: (page) => hoverContentViolation(page) },
];

const VIEWPORT_PROBES: readonly GuardedProbe[] = [
  { id: "forced-colors", run: (page) => forcedColorsViolation(page) },
  { id: "reduced-motion", run: (page) => reducedMotionViolation(page) },
  { id: "reflow", run: (page) => reflowViolation(page) },
  { id: "resize-text", run: (page) => resizeTextViolation(page) },
  {
    id: "target-size-enhanced",
    run: (page) => targetSizeEnhancedViolation(page),
  },
];

async function collectCustomViolations(
  page: Page,
): Promise<{ violations: CustomViolation[]; probeFailures: string[] }> {
  const probeFailures: string[] = [];
  const run = async (probe: GuardedProbe): Promise<CustomViolation[]> => {
    await quiescePageForProbe(page);
    // Per-probe markers: the last started-but-unfinished probe names the
    // stall when a run dies mid-pass.
    console.info(`[progress] runtime probe ${probe.id} started`);
    const start = Date.now();
    try {
      return await runProbe(probeFailures, probe.id, () => probe.run(page));
    } finally {
      console.info(
        `[progress] runtime probe ${probe.id} finished ms=${Date.now() - start}`,
      );
    }
  };

  const measured: CustomViolation[][] = [];
  for (const probe of MEASUREMENT_PROBES) {
    measured.push(await run(probe));
  }

  const violations: CustomViolation[] = [];
  for (const probe of INTERACTION_PROBES) {
    violations.push(...(await run(probe)));
  }
  await restorePageAfterMutatingProbes(page);
  for (const probe of VIEWPORT_PROBES) {
    violations.push(...(await run(probe)));
  }

  violations.push(...measured.flat());

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
    ...(await runProbe(probeFailures, "focus", async () => {
      await quiescePageForProbe(page);
      return focusCustomViolations(page);
    })),
    ...(await runProbe(probeFailures, "non-text-contrast", async () => {
      await quiescePageForProbe(page);
      return nonTextContrastViolation(page);
    })),
  ];
  return {
    findings: findingsFromCustomViolations(pageUrl, theme),
    probeFailures,
  };
}
