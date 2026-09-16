/**
 * Single registration point for every catalog check.
 *
 * Adding a check id is one entry here — authority, runtime-only / composition
 * / html-validate / package-twin flags, the analyzers that can emit it, and the
 * catalog control it powers all live beside the id instead of in six parallel
 * lists. Coverage tests cross-check this registry against the AST
 * implementations (`checks/registry.ts`), the rule maps (`jsx-a11y-map.ts`,
 * `runtime/axe-map.ts`, `runtime/html-validate-map.ts`), the Playwright probes,
 * and the catalog (`packages/analysis-core/src/catalog/rgaa/controls.ts`), so a check can
 * never ship without an engine, a catalog row, or guidance.
 *
 * `CheckId` and `CHECK_IDS` are derived from this array.
 */

import type { AnalyzerId } from "./contract/finding-types.ts";
import type { CheckAuthority } from "./contract/requirement-status.ts";

export interface CheckRegistration {
  /** Catalog check id — the only place the id itself is listed. */
  id: string;
  /**
   * Effective authority class. Already precedence-resolved (site_level first,
   * then runtime_only, then heuristic, then standard) — same contract as the
   * old `authorityForCheck` classifier.
   */
  authority: Exclude<CheckAuthority, "manual">;
  /** AST unreliable for this rule — runtime overrides source when it ran. */
  compositionSensitive?: boolean;
  /**
   * Verdict can depend on files beyond the one scanned (document order,
   * cross-node structure, id uniqueness): a scoped re-scan of only changed
   * files cannot confirm or clear these, so any run assessing them must scan
   * the full tree. Strictly narrower than `compositionSensitive` (which also
   * covers runtime-merge authority) — see `requiresFullTreeScan`.
   */
  crossFile?: boolean;
  /** Only html-validate emits this at runtime; status requires it ran. */
  htmlValidateOwned?: boolean;
  /** Source findings duplicate axe / html-validate / jsx-a11y on the rendered page. */
  packageTwinSource?: boolean;
  /**
   * Site-level checks that also behave as runtime-only for merge / keep-open.
   * Prefer `authority: "runtime_only"` — only set this on the eight site_level
   * exceptions that need both (`consistent-lang` / `consistent-page-heading`
   * are site_level without this flag).
   */
  runtimeOnly?: boolean;
  /** Analyzers that can emit findings for this check. */
  analyzers?: readonly AnalyzerId[];
  /** Catalog control this check powers (verified 1:1 by the catalog coverage test). */
  catalogControlId: string;
}

/** One entry per check — see file header. */
export const CHECK_REGISTRY = [
  {
    id: "img-alt",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-img-alt",
  },
  {
    id: "button-name",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-button-name",
  },
  {
    id: "html-lang",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-html-lang",
  },
  {
    id: "positive-tabindex",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-focus-order",
  },
  {
    id: "input-label",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["ast", "jsx-a11y", "axe"],
    catalogControlId: "ctl-input-label",
  },
  {
    id: "anchor-name",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-link-name",
  },
  {
    id: "heading-order",
    authority: "standard",
    compositionSensitive: true,
    crossFile: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-heading-order",
  },
  {
    id: "empty-heading",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-empty-heading",
  },
  {
    id: "iframe-title",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-iframe-title",
  },
  {
    id: "autoplay-media",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-autoplay-media",
  },
  {
    id: "duplicate-id",
    authority: "standard",
    compositionSensitive: true,
    crossFile: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-duplicate-id",
  },
  {
    id: "form-error-association",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-form-error-association",
  },
  {
    id: "aria-hidden-focusable",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-aria-hidden-focusable",
  },
  {
    id: "aria-role",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-aria-role",
  },
  {
    id: "aria-props",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-aria-props",
  },
  {
    id: "aria-required-attr",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-aria-required-attr",
  },
  {
    id: "no-autofocus",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y"],
    catalogControlId: "ctl-no-autofocus",
  },
  {
    id: "keyboard-interaction",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-keyboard-interaction",
  },
  {
    id: "dialog-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-dialog-keyboard",
  },
  {
    id: "tabs-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-tabs-keyboard",
  },
  {
    id: "disclosure-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-disclosure-keyboard",
  },
  {
    id: "menu-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-menu-keyboard",
  },
  {
    id: "meta-viewport",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-meta-viewport",
  },
  {
    id: "list-structure",
    authority: "standard",
    packageTwinSource: true,
    crossFile: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-list-structure",
  },
  {
    id: "color-contrast",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-color-contrast",
  },
  {
    id: "document-title",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-document-title",
  },
  {
    id: "bypass",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-bypass",
  },
  {
    id: "landmark-one-main",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-landmark-one-main",
  },
  {
    id: "nested-interactive",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-nested-interactive",
  },
  {
    id: "target-size",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-target-size",
  },
  {
    id: "target-size-enhanced",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-target-size-enhanced",
  },
  {
    id: "autocomplete-valid",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-autocomplete-valid",
  },
  {
    id: "table-headers",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-table-headers",
  },
  {
    id: "page-heading",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-page-heading",
  },
  {
    id: "content-region",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-content-region",
  },
  {
    id: "label-in-name",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-label-in-name",
  },
  {
    id: "lang-parts",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-lang-parts",
  },
  {
    id: "aria-roledescription",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-aria-roledescription",
  },
  {
    id: "presentation-role",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-presentation-role",
  },
  {
    id: "no-auto-refresh",
    authority: "runtime_only",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-no-auto-refresh",
  },
  {
    id: "no-orientation-lock",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-no-orientation-lock",
  },
  {
    id: "landmark-unique",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-landmark-unique",
  },
  {
    id: "pointer-gesture",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-pointer-gesture",
  },
  {
    id: "pointer-cancellation",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-pointer-cancellation",
  },
  {
    id: "motion-actuation",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-motion-actuation",
  },
  {
    id: "video-caption",
    authority: "runtime_only",
    packageTwinSource: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-video-caption",
  },
  {
    id: "audio-caption",
    authority: "runtime_only",
    packageTwinSource: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-audio-caption",
  },
  {
    id: "no-blink-marquee",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-no-blink-marquee",
  },
  {
    id: "text-spacing",
    authority: "standard",
    compositionSensitive: true,
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-text-spacing",
  },
  {
    id: "use-of-color",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-use-of-color",
  },
  {
    id: "empty-th",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-empty-th",
  },
  {
    id: "dialog-name",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-dialog-name",
  },
  {
    id: "tab-name",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-tab-name",
  },
  {
    id: "summary-name",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-summary-name",
  },
  {
    id: "frame-keyboard",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-frame-keyboard",
  },
  {
    id: "p-as-heading",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-p-as-heading",
  },
  {
    id: "doctype",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-doctype",
  },
  {
    id: "fieldset-legend",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-fieldset-legend",
  },
  {
    id: "autocomplete-purpose",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-autocomplete-purpose",
  },
  {
    id: "no-accesskey",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-no-accesskey",
  },
  {
    id: "optgroup",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-optgroup",
  },
  {
    id: "table-caption",
    authority: "standard",
    analyzers: ["ast", "axe"],
    catalogControlId: "ctl-table-caption",
  },
  {
    id: "th-scope",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y"],
    catalogControlId: "ctl-th-scope",
  },
  {
    id: "layout-table-markup",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-layout-table-markup",
  },
  {
    id: "svg-name",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-svg-name",
  },
  {
    id: "figure-caption",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-figure-caption",
  },
  {
    id: "redundant-role",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y"],
    catalogControlId: "ctl-redundant-role",
  },
  {
    id: "noninteractive-tabindex",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y"],
    catalogControlId: "ctl-noninteractive-tabindex",
  },
  {
    id: "aria-activedescendant",
    authority: "standard",
    packageTwinSource: true,
    analyzers: ["jsx-a11y"],
    catalogControlId: "ctl-aria-activedescendant",
  },
  {
    id: "focus-visible",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-focus-visible",
  },
  {
    id: "keyboard-trap",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-keyboard-trap",
  },
  {
    id: "focus-not-obscured",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-focus-not-obscured",
  },
  {
    id: "accessible-auth",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-accessible-auth",
  },
  {
    id: "dragging",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-dragging",
  },
  {
    id: "new-window-onload",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-new-window-onload",
  },
  {
    id: "dir-change",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-dir-change",
  },
  {
    id: "blockquote-cite",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-blockquote-cite",
  },
  {
    id: "status-live",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-status-live",
  },
  {
    id: "live-region-updates",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-live-region-updates",
  },
  {
    id: "hover-content",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-hover-content",
  },
  {
    id: "non-text-contrast",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-non-text-contrast",
  },
  {
    id: "forced-colors",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-forced-colors",
  },
  {
    id: "reflow",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-reflow",
  },
  {
    id: "text-spacing-runtime",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-text-spacing-runtime",
  },
  {
    id: "label-adjacent",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-label-adjacent",
  },
  {
    id: "both-colors",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-both-colors",
  },
  {
    id: "redundant-entry",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-redundant-entry",
  },
  {
    id: "html-lang-valid",
    authority: "runtime_only",
    analyzers: ["jsx-a11y", "axe"],
    catalogControlId: "ctl-html-lang-valid",
  },
  {
    id: "table-summary",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-table-summary",
  },
  {
    id: "image-detailed-description",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-image-detailed-description",
  },
  {
    id: "media-controls-present",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-media-controls-present",
  },
  {
    id: "css-disabled-content",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-css-disabled-content",
  },
  {
    id: "media-keyboard",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-media-keyboard",
  },
  {
    id: "multiple-ways",
    authority: "site_level",
    // site_level ∩ runtime-only exception — see CheckRegistration.runtimeOnly
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-multiple-ways",
  },
  {
    id: "consistent-nav",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-nav",
  },
  {
    id: "consistent-labels",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-labels",
  },
  {
    id: "consistent-help",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-help",
  },
  {
    id: "nontemporal-media-alt",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-nontemporal-media-alt",
  },
  {
    id: "field-grouping",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-field-grouping",
  },
  {
    id: "resize-text",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-resize-text",
  },
  {
    id: "audio-description-track",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-audio-description",
  },
  {
    id: "link-explicit-heuristic",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-link-explicit",
  },
  {
    id: "office-docs-alt-present",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-office-docs-alt-present",
  },
  {
    id: "media-keyboard-static",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-media-keyboard-static",
  },
  {
    id: "css-hover-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-css-hover-keyboard",
  },
  {
    id: "consistent-sitemap",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-search-relevant",
  },
  {
    id: "consistent-search",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-nav-mechanisms-relevant",
  },
  {
    id: "consistent-landmarks",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-landmark-regions-consistent",
  },
  {
    id: "duplicate-page-title",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-page-title-unique",
  },
  {
    id: "consistent-lang",
    authority: "site_level",
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-lang",
  },
  {
    id: "consistent-page-heading",
    authority: "site_level",
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-page-heading",
  },
  {
    id: "decorative-ignored",
    authority: "standard",
    analyzers: ["ast"],
    catalogControlId: "ctl-decorative-ignored",
  },
  {
    id: "lang-change",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-lang-change-indicated",
  },
  {
    id: "cryptic-content-alt",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-cryptic-content-alt",
  },
  {
    id: "audio-description-or-alt",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-audio-description-or-alt",
  },
  {
    id: "captions-live",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-captions-live",
  },
  {
    id: "focus-order-logical",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-focus-order-logical",
  },
  {
    id: "focus-not-obscured-enhanced",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-focus-not-obscured-enhanced",
  },
  {
    id: "focus-appearance",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-focus-appearance",
  },
  {
    id: "identical-links-purpose",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-identical-links-purpose",
  },
  {
    id: "hidden-content",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-hidden-content-ignored",
  },
  {
    id: "css-for-presentation",
    authority: "runtime_only",
    htmlValidateOwned: true,
    analyzers: ["html-validate"],
    catalogControlId: "ctl-css-for-presentation",
  },
  {
    id: "css-off-understandable",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-css-off-understandable",
  },
  {
    id: "layout-table-linearization",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-layout-table-linearization",
  },
  {
    id: "error-prevention",
    authority: "heuristic",
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-error-prevention",
  },
  {
    id: "accessible-auth-enhanced",
    authority: "heuristic",
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-accessible-auth-enhanced",
  },
  {
    id: "captcha-alternative",
    authority: "heuristic",
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-captcha-alternative",
  },
  {
    id: "supplementary-content-keyboard",
    authority: "runtime_only",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-supplementary-content-keyboard",
  },
  {
    id: "reduced-motion",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-reduced-motion",
  },
  {
    id: "media-identification",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-media-identification",
  },
  {
    id: "color-contrast-enhanced",
    authority: "runtime_only",
    analyzers: ["axe"],
    catalogControlId: "ctl-color-contrast-enhanced",
  },
  {
    id: "markup-nesting",
    authority: "runtime_only",
    htmlValidateOwned: true,
    analyzers: ["html-validate"],
    catalogControlId: "ctl-markup-validity",
  },
  {
    id: "broken-link",
    authority: "runtime_only",
    analyzers: ["linkinator"],
    catalogControlId: "ctl-link-destination",
  },
] as const satisfies readonly CheckRegistration[];

/** The `CheckId` union — derived so the type and the list can never drift. */
export type CheckId = (typeof CHECK_REGISTRY)[number]["id"];

/** Every catalog check id, in registration order. */
export const CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY.map(
  (entry) => entry.id,
);
