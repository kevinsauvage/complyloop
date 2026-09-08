import type { RawFinding } from "../types.ts";
import type { AxeViolationLike } from "./findings.ts";

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

/** Default product assessment pass — dark and light scheme re-audits. */
export const DEFAULT_THEME_CONDITIONS: readonly BrowserCondition[] = [
  "dark",
  "light",
];

/** Human-readable label shown on condition-specific findings. */
export function conditionLabel(condition: BrowserCondition): string {
  switch (condition) {
    case "dark":
      return "dark";
    case "light":
      return "light";
    case "more-contrast":
      return "prefers-contrast: more";
    default: {
      const _exhaustive: never = condition;
      throw new Error(`Unhandled browser condition: ${_exhaustive}`);
    }
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
    default: {
      const _exhaustive: never = condition;
      throw new Error(`Unhandled browser condition: ${_exhaustive}`);
    }
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
  "link-in-text-block",
]);

/** Identity of one axe node: rule id + primary target selector. */
function violationNodeKey(
  ruleId: string,
  target: ReadonlyArray<string> | undefined,
): string {
  return `${ruleId}::${target?.[0] || ""}`;
}

function findingKey(finding: RawFinding): string {
  const selector =
    finding.location.kind === "dom" ? finding.location.selector : "";
  return `${finding.checkId}::${selector}`;
}

/**
 * Items under a browser condition that were not present in the baseline pass.
 * `keys` may yield several identities per item (e.g. one per axe node);
 * `project` builds the labeled result from the novel keys only.
 */
function conditionSpecific<T>(
  baseline: ReadonlyArray<T>,
  condition: ReadonlyArray<T>,
  keys: (item: T) => ReadonlyArray<string>,
  project: (item: T, novelKeys: ReadonlySet<string>) => T | null,
): T[] {
  const baselineKeys = new Set(baseline.flatMap((item) => [...keys(item)]));
  const seen = new Set<string>();
  const specific: T[] = [];

  for (const item of condition) {
    const novel = new Set<string>();
    for (const key of keys(item)) {
      if (baselineKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      novel.add(key);
    }
    if (novel.size === 0) continue;
    const projected = project(item, novel);
    if (projected) specific.push(projected);
  }
  return specific;
}

/**
 * Returns the violations observed under a browser condition that were NOT seen
 * in the baseline (default) pass — the findings that only fail in one state.
 * Compared per node so a multi-node baseline rule does not hide (or re-add)
 * overlapping nodes when axe reorders targets under the condition.
 * Each returned violation's description is prefixed so the evidence says which
 * condition produced it.
 */
export function conditionSpecificViolations(
  baseline: ReadonlyArray<AxeViolationLike>,
  condition: ReadonlyArray<AxeViolationLike>,
  conditionLabel: string,
): AxeViolationLike[] {
  return conditionSpecific(
    baseline,
    condition,
    (violation) =>
      violation.nodes.map((node) =>
        violationNodeKey(violation.id, node.target),
      ),
    (violation, novelKeys) => {
      const nodes = violation.nodes.filter((node) =>
        novelKeys.has(violationNodeKey(violation.id, node.target)),
      );
      if (nodes.length === 0) return null;
      return {
        ...violation,
        nodes,
        description: `[${conditionLabel} only] ${violation.description}`,
      };
    },
  );
}

/** Same as `conditionSpecificViolations` for Playwright custom findings. */
export function conditionSpecificFindings(
  baseline: ReadonlyArray<RawFinding>,
  condition: ReadonlyArray<RawFinding>,
  conditionLabel: string,
): RawFinding[] {
  return conditionSpecific(
    baseline,
    condition,
    (finding) => [findingKey(finding)],
    (finding) => ({
      ...finding,
      reason: `[${conditionLabel} only] ${finding.reason}`,
    }),
  );
}
