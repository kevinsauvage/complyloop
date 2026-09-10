import type { CheckAuthority } from "./contract/requirement-status.ts";
import { CHECK_REGISTRY, type CheckRegistration } from "./check-registry.ts";

/**
 * All check-id lists are derived from the single `CHECK_REGISTRY` — adding a
 * check is one entry there, not six parallel lists. The classifiers below keep
 * their exact public behavior (verified by `check-authority.test.ts`).
 */

const REGISTRY_BY_ID = new Map<string, CheckRegistration>(
  CHECK_REGISTRY.map((entry) => [entry.id, entry] as const),
);

const entryFor = (checkId: string): CheckRegistration | undefined =>
  REGISTRY_BY_ID.get(checkId);

export const isHtmlValidateOwnedCheck = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.htmlValidateOwned);

export const isCompositionSensitiveCheck = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.compositionSensitive);

export const isRuntimeOnlyCheck = (checkId: string): boolean => {
  const entry = entryFor(checkId);
  return Boolean(
    entry && (entry.authority === "runtime_only" || entry.runtimeOnly),
  );
};

export const isHeuristicCheck = (checkId: string): boolean =>
  entryFor(checkId)?.authority === "heuristic";

export const isPackageTwinSourceCheck = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.packageTwinSource);

/**
 * The single authority classifier. `authority` on each registry entry is
 * already precedence-resolved (site_level → runtime_only → heuristic →
 * standard), so this is a lookup with a `standard` fallback for unknown ids.
 *
 * Precedence is the contract:
 *
 * 1. `site_level` (needs ≥2 routes; subset of runtime-only except
 *    `consistent-lang` / `consistent-page-heading`)
 * 2. `runtime_only` (runtime audit owns the verdict)
 * 3. `heuristic` (empty AST scan must not pass)
 * 4. `standard` (plain AST check; composition-sensitive ids use standard
 *    authority but runtime overrides AST when it ran — see
 *    `isCompositionSensitiveCheck`)
 *
 * Consumers: `deriveRequirementStatus` (`contract/requirement-status.ts`) via
 * the adapter in `src/server/assessment-status.ts`.
 */
export function authorityForCheck(checkId: string): CheckAuthority {
  return entryFor(checkId)?.authority ?? "standard";
}

/**
 * Runtime hits for heuristic check ids are never authoritative violations —
 * they downgrade to warnings at moderate/medium, so an empty-heuristic scan can
 * never pass a criterion. Both runtime adapters (axe + Playwright probes) share
 * this single definition.
 */
export const HEURISTIC_RUNTIME_DOWNGRADE = {
  kind: "warning",
  severity: "moderate",
  confidence: "medium",
} as const;