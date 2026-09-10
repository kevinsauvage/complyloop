/**
 * Shared criteria for AST and runtime error-prevention / captcha checks.
 *
 * Intentional gap: AST also accepts `window.confirm` in `onSubmit`/`onClick`
 * handlers; runtime does not (DOM-only probe).
 */

/** data-* attribute names that count as a confirm/review safeguard (AST + runtime). */
export const ERROR_PREVENTION_CONFIRM_DATA_ATTRS = [
  "data-confirm",
  "data-review-step",
  "data-confirm-submit",
] as const;

/**
 * `HTMLElement.dataset` keys corresponding to
 * {@link ERROR_PREVENTION_CONFIRM_DATA_ATTRS} (camelCase).
 */
export const ERROR_PREVENTION_CONFIRM_DATASET_KEYS = [
  "confirm",
  "reviewStep",
  "confirmSubmit",
] as const;

/** Known captcha host component tag names (AST). Single source: captcha-config. */
export { CAPTCHA_COMPONENT_HOSTS } from "./captcha-config.ts";
