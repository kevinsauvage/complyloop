import fs from "node:fs";
import { afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

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

export const PLAYWRIGHT_TEST_TIMEOUT_MS = 30_000;
