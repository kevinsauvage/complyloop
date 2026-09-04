import fs from "node:fs";
import { afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

let sharedBrowser: Browser | null = null;

export function chromiumExecutableAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

export async function withPlaywrightPage(
  html: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  sharedBrowser ??= await chromium.launch({ headless: true });
  const context = await sharedBrowser.newContext();
  const page = await context.newPage();
  await page.setContent(html);
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
