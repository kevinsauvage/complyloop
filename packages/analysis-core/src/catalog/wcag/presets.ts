import { catalogControlIds } from "../catalog.ts";
import type { FrameworkPreset } from "../registry.ts";
import { rgaaControls } from "../rgaa/controls.ts";
import { wcagFramework } from "./controls";

/**
 * AAA / enhanced heuristics that must not leak into the AA assessment target.
 * Everything else in the catalog is AA unless listed in {@link WCAG_FULL_ONLY_IDS}.
 */
const WCAG_EXTRA_ONLY_IDS = new Set(
  catalogControlIds([
    "ctl-focus-not-obscured-enhanced",
    "ctl-focus-appearance",
    "ctl-accessible-auth-enhanced",
    "ctl-color-contrast-enhanced",
    "ctl-target-size-enhanced",
    "ctl-reduced-motion",
    "ctl-pointer-gesture",
    "ctl-pointer-cancellation",
    "ctl-motion-actuation",
    "ctl-focus-context-change",
    "ctl-input-context-change",
    "ctl-sensory-characteristics",
    "ctl-image-of-text",
    "ctl-error-suggestion",
  ]),
);

/**
 * Manual / twin / site-level controls that stay on Full WCAG only.
 * New catalog rows default into AA + extra until listed here or in extra-only.
 */
const WCAG_FULL_ONLY_IDS = new Set(
  catalogControlIds([
    "ctl-link-destination",
    "ctl-dialog-keyboard",
    "ctl-tabs-keyboard",
    "ctl-disclosure-keyboard",
    "ctl-menu-keyboard",
    "ctl-landmark-unique",
    "ctl-live-region-updates",
    "ctl-captcha-alt",
    "ctl-image-description-relevant",
    "ctl-transcript-relevant",
    "ctl-table-summary-relevant",
    "ctl-layout-table-linearization",
    "ctl-table-title-relevant",
    "ctl-script-alternative-relevant",
    "ctl-sensory-rule-relevant",
    "ctl-legend-relevant",
    "ctl-button-name-relevant",
    "ctl-validation-relevant",
    "ctl-office-docs-alt",
    "ctl-flash-threshold",
    "ctl-consistent-lang",
    "ctl-consistent-page-heading",
  ]),
);

function wcagAaControlIds(): string[] {
  return rgaaControls
    .filter(
      (control) =>
        !WCAG_EXTRA_ONLY_IDS.has(control.id) &&
        !WCAG_FULL_ONLY_IDS.has(control.id),
    )
    .map((control) => control.id);
}

function wcagExtraControlIds(): string[] {
  return rgaaControls
    .filter((control) => !WCAG_FULL_ONLY_IDS.has(control.id))
    .map((control) => control.id);
}

/** Framework + level targets for WCAG assessment. */
export const wcagPresets: FrameworkPreset[] = [
  {
    id: "preset-wcag-full",
    name: "Full WCAG 2.2",
    description:
      "Every catalog control for WCAG (automated and human-reviewed)",
    frameworkId: wcagFramework.id,
    controlIds: rgaaControls.map((control) => control.id),
  },
  {
    id: "preset-wcag-aa",
    name: "WCAG 2.2 AA",
    description: "Core WCAG 2.2 AA success criteria",
    frameworkId: wcagFramework.id,
    controlIds: wcagAaControlIds(),
  },
  {
    id: "preset-wcag-aaa",
    name: "WCAG 2.2 extra checks",
    description: "AA plus extra heuristic checks; not WCAG AAA",
    frameworkId: wcagFramework.id,
    controlIds: wcagExtraControlIds(),
  },
];
