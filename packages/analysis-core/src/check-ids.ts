/**
 * Runtime source of truth for the `CheckId` union.
 *
 * The ids themselves live in `check-registry.ts` — one entry per check.
 * This module re-exports them so `@complyloop/analysis-core/check-ids` keeps
 * a stable public path.
 */
export { CHECK_IDS } from "./check-registry.ts";
export type { CheckId } from "./check-registry.ts";