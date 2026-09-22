import { afterAll } from "vitest";

import { closeSharedBrowser } from "./playwright-page";

/**
 * Test-only: closes the shared probe browser after the suite. Kept out of
 * `playwright-page.ts` so shipped analysis code never imports `vitest`.
 */
export function registerPlaywrightBrowserTeardown(): void {
  afterAll(async () => {
    await closeSharedBrowser();
  });
}
