/**
 * Shared CSS selector fragments for runtime interactive-control probes.
 *
 * Intentional exclusions (documented next to each export):
 * - disabled / aria-disabled — target-size only measures operable targets
 * - checkbox / radio / file / range — native size is UA-controlled (WCAG 2.5.5)
 * - forced-colors adds textbox/switch/slider roles — chrome visibility matters
 *   for those widgets under high-contrast mode
 */

/** Native + link hosts shared by contrast and forced-colors probes. */
export const BASIC_CONTROL_HOSTS = [
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "a[href]",
] as const;

/** ARIA button / checkable roles used by non-text contrast. */
export const CONTRAST_ARIA_ROLES = [
  '[role="button"]',
  '[role="checkbox"]',
  '[role="radio"]',
] as const;

/**
 * Forced-colors also inspects textbox / switch / slider — they often rely on
 * decorative borders that disappear under Windows High Contrast.
 */
export const FORCED_COLORS_ARIA_ROLES = [
  '[role="button"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
] as const;

/** WCAG 1.4.11 Non-text Contrast — includes disabled hosts (chrome still visible). */
export const NON_TEXT_CONTRAST_CONTROL_SELECTOR = [
  ...BASIC_CONTROL_HOSTS,
  ...CONTRAST_ARIA_ROLES,
].join(", ");

/**
 * WCAG 2.5.5 Target Size (Enhanced) — enabled hosts only; excludes
 * checkbox/radio/file/range (UA-sized) and aria-disabled buttons.
 */
export const ENHANCED_TARGET_CONTROL_SELECTOR = [
  "button:not([disabled])",
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[role="button"]:not([aria-disabled="true"])',
].join(", ");

/** Forced-colors boundary visibility across native + common ARIA widgets. */
export const FORCED_COLORS_CONTROL_SELECTOR = [
  ...BASIC_CONTROL_HOSTS,
  ...FORCED_COLORS_ARIA_ROLES,
].join(", ");
