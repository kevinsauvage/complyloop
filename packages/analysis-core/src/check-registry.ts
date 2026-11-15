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
 * Entries live in `check-registry/`, one file per authority class; `CheckId`
 * and `CHECK_IDS` are derived from the composed array.
 */

import { HEURISTIC_CHECKS } from "./check-registry/heuristic.ts";
import { RUNTIME_ONLY_CHECKS } from "./check-registry/runtime-only.ts";
import { SITE_LEVEL_CHECKS } from "./check-registry/site-level.ts";
import { STANDARD_CHECKS } from "./check-registry/standard.ts";
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
   * Verdict rests on inference (text keywords, DOM heuristics, geometry that
   * may be decorative) rather than a deterministic fact. Advisory checks never
   * fail a requirement: their findings are emitted as `warning` (needs_review)
   * so a human confirms. Set on heuristic-inference probes regardless of
   * authority, so `runtime_only`/`site_level` inference cannot hard-fail.
   */
  advisory?: boolean;
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
  analyzers?: readonly AnalyzerId[];
  /** Catalog control this check powers (verified 1:1 by the catalog coverage test). */
  catalogControlId: string;
}

export const CHECK_REGISTRY = [
  ...STANDARD_CHECKS,
  ...HEURISTIC_CHECKS,
  ...RUNTIME_ONLY_CHECKS,
  ...SITE_LEVEL_CHECKS,
] as const satisfies readonly CheckRegistration[];

/** The `CheckId` union — derived so the type and the list can never drift. */
export type CheckId = (typeof CHECK_REGISTRY)[number]["id"];

export const CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY.map(
  (entry) => entry.id,
);
