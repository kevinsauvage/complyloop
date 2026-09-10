import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { normalizeRoutes } from "@complyloop/analysis-core/runtime/routes";

export const ABSOLUTE_ROUTE_MESSAGE =
  "Routes must be paths under the Preview / staging URL (e.g. `/` or `/pricing`), not absolute http(s) URLs.";

/**
 * Parses the free-text routes field (newlines/commas), rejecting absolute
 * URLs. Returns `[]` for blank input — storage keeps "not configured" and the
 * scan-time `["/"]` default lives in `runtimeRoutesFor`.
 */
export function parseRoutes(raw: string | undefined): string[] {
  if (raw == null) return [];
  const entries = raw.split(/[\n,]+/);
  for (const entry of entries) {
    if (/^https?:\/\//i.test(entry.trim())) {
      throw new PublicError(ABSOLUTE_ROUTE_MESSAGE);
    }
  }
  return normalizeRoutes(entries);
}
