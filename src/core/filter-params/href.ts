import type { Route } from "next";

type SearchParams = Record<string, string | undefined>;

/**
 * Append defined query params to `path`; returns the bare path when none apply.
 * Typed as `Route` so call sites satisfy Next.js `typedRoutes` — a route literal
 * is statically checked, and a query string built from it is accepted.
 */
export function href<T extends Route>(
  path: T,
  params: SearchParams,
): T | `${T}?${string}` {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
