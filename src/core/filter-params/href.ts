import type { AppHref } from "../routes";

type SearchParams = Record<string, string | undefined>;

/**
 * Append defined query params to `path`; returns the bare path when none apply.
 * Typed against `AppHref` so both static routes and project-scoped paths (which
 * are template literal types, not `Route` literals) satisfy `typedRoutes`.
 */
export function href<T extends AppHref>(
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
