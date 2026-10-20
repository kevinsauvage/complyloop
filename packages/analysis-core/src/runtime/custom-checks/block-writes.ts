import type { Page } from "playwright-core";

/**
 * Probes that submit forms must never change state on the audited site: an
 * unrequired field passes native validation, so "submit empty" can reach a
 * real newsletter or contact endpoint. Every non-read request is aborted for
 * the duration of the probe; the page's own validation scripts still run.
 */
export async function withBlockedWrites<T>(
  page: Page,
  run: () => Promise<T>,
): Promise<T> {
  const handler = (route: import("playwright-core").Route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return route.fallback();
    }
    return route.abort("blockedbyclient");
  };
  await page.route("**/*", handler);
  try {
    return await run();
  } finally {
    await page.unroute("**/*", handler).catch(() => {});
  }
}
