import fs from "node:fs";

import { type Browser, chromium, type Page } from "playwright-core";
import { afterAll } from "vitest";

let sharedBrowser: Browser | null = null;

const PROBE_PAGE_ORIGIN = "https://complyloop-probe.test";

export function chromiumExecutableAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

export async function withPlaywrightPage(
  html: string,
  options?: { routable?: boolean },
): Promise<{ page: Page; close: () => Promise<void> }> {
  sharedBrowser ??= await chromium.launch({ headless: true });
  const context = await sharedBrowser.newContext();
  const page = await context.newPage();
  if (options?.routable) {
    await page.route(`${PROBE_PAGE_ORIGIN}/**`, async (route) => {
      await route.fulfill({ contentType: "text/html", body: html });
    });
    await page.goto(`${PROBE_PAGE_ORIGIN}/`, {
      waitUntil: "domcontentloaded",
    });
  } else {
    await page.setContent(html);
  }
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

export function registerPlaywrightBrowserTeardown(): void {
  afterAll(async () => {
    await sharedBrowser?.close();
    sharedBrowser = null;
  });
}

/**
 * Opens a probe page, runs `fn`, and always closes the context — the
 * try/finally every browser probe test otherwise repeats.
 */
export async function withProbePage<T>(
  html: string,
  fn: (page: Page) => Promise<T>,
  options?: { routable?: boolean },
): Promise<T> {
  const { page, close } = await withPlaywrightPage(html, options);
  try {
    return await fn(page);
  } finally {
    await close();
  }
}

export const PLAYWRIGHT_TEST_TIMEOUT_MS = 30_000;
