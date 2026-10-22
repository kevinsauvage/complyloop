import { CHECK_REGISTRY, type CheckRegistration } from "./check-registry.ts";
import {
  type CheckAuthority,
  type DerivationFinding,
  deriveRequirementStatus,
} from "./contract/requirement-status.ts";
import type { RequirementStatus } from "./contract/statuses.ts";

/**
 * All check-id lists derive from the single `CHECK_REGISTRY` (one entry per
 * check, not six parallel lists); classifiers' public behavior is pinned by
 * `check-authority.test.ts`.
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

/**
 * Checks whose verdict can depend on files beyond the one scanned, so only a
 * full-tree scan can confirm or clear them. Deliberately narrower than
 * `isCompositionSensitiveCheck`; the two sets evolve independently.
 */
export const requiresFullTreeScan = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.crossFile);

export const isRuntimeOnlyCheck = (checkId: string): boolean => {
  const entry = entryFor(checkId);
  return Boolean(
    entry && (entry.authority === "runtime_only" || entry.runtimeOnly),
  );
};

export const isHeuristicCheck = (checkId: string): boolean =>
  entryFor(checkId)?.authority === "heuristic";

/**
 * Checks whose verdict rests on inference (text keywords, DOM heuristic,
 * decorative-geometry) rather than a deterministic fact. Their findings must
 * never assert a `violation`; adapters downgrade them to `warning`
 * (needs_review) so a human confirms. Independent of authority class.
 */
export const isAdvisoryCheck = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.advisory);

/** True when the check id is still registered in the engine (a stored finding
 * for an unregistered check is a retired check — see the assessment GC). */
export const isRegisteredCheck = (checkId: string): boolean =>
  entryFor(checkId) !== undefined;

export const isPackageTwinSourceCheck = (checkId: string): boolean =>
  Boolean(entryFor(checkId)?.packageTwinSource);

/**
 * Single authority classifier; `authority` on each registry entry is already
 * precedence-resolved (site_level → runtime_only → heuristic → standard), so
 * this is a lookup with a `standard` fallback. Precedence is the contract:
 * `site_level` needs ≥2 routes, `runtime_only` means no live audit, `heuristic`
 * must not pass on an empty scan, and composition-sensitive ids use `standard`
 * authority but are overridden by runtime at merge (see
 * `isCompositionSensitiveCheck`).
 */
export function authorityForCheck(checkId: string): CheckAuthority {
  return entryFor(checkId)?.authority ?? "standard";
}

/** Audit context for {@link deriveStatusForCheck} — mirrors the engines that ran. */
export interface CheckAuditInput {
  runtimeRan?: boolean;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
  /** Check ids confirmed not applicable on every audited page (checkId → fact). */
  applicabilityFacts?: ReadonlyMap<string, string>;
  /** Number of source files scanned during AST analysis. */
  filesScanned?: number;
}

/**
 * Single entry point for "what status does this check's requirement get?": maps
 * the check id to an authority class (`manual` when null) and delegates to
 * `deriveRequirementStatus`. Pure — static registry only.
 */
export function deriveStatusForCheck(
  checkId: string | null,
  openFindings: ReadonlyArray<DerivationFinding>,
  audit?: CheckAuditInput,
): RequirementStatus {
  return deriveRequirementStatus({
    authority: checkId === null ? "manual" : authorityForCheck(checkId),
    openFindings,
    audit: {
      runtimeRan: audit?.runtimeRan,
      siteLevelChecksRan: audit?.siteLevelChecksRan,
      htmlValidateRequired:
        checkId !== null && isHtmlValidateOwnedCheck(checkId),
      htmlValidateRan: audit?.htmlValidateRan,
      applicabilityConfirmed:
        checkId !== null && Boolean(audit?.applicabilityFacts?.has(checkId)),
      filesScanned: audit?.filesScanned,
    },
  });
}

/**
 * Runtime hits on heuristic ids are never authoritative — downgrade to warnings
 * so an empty-heuristic scan can never pass. Shared by both runtime adapters.
 */
export const HEURISTIC_RUNTIME_DOWNGRADE = {
  kind: "warning",
  severity: "moderate",
  confidence: "medium",
} as const;
