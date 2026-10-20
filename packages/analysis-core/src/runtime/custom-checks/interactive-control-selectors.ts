/**
 * Shared CSS selector fragments for runtime interactive-control probes.
 *
 * Intentional exclusions (documented next to each export):
 * - disabled / aria-disabled — target-size only measures operable targets
 * - checkbox / radio / file / range — native size is UA-controlled (WCAG 2.5.5)
 */

/** Native + link hosts shared by contrast probes. */
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
