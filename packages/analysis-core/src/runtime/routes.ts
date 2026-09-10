/**
 * Shared route normalization for runtime audits.
 *
 * Trims entries, drops empties, and ensures a leading `/` on plain paths.
 * Absolute http(s) URLs pass through untouched so the scan-time SSRF gate
 * (`assertSafeRuntimeUrl`) can still see and refuse them. Does NOT apply the
 * scan-time `["/"]` default — storage keeps `[]` for "not configured" so the
 * settings UI can distinguish blank from explicit, while
 * {@link runtimeRoutesFor} applies the default at scan time.
 */
export function normalizeRoutes(routes: ReadonlyArray<string>): string[] {
  return routes
    .map((route) => route.trim())
    .filter((route) => route.length > 0)
    .map((route) =>
      route.startsWith("/") || /^https?:\/\//i.test(route)
        ? route
        : `/${route}`,
    );
}
