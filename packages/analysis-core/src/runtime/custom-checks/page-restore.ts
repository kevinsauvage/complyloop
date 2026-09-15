import type { Page } from "playwright";

const GOTO_TIMEOUT_MS = 30_000;
const POST_DOM_SETTLE_MS = 250;

/**
 * Reload the audit URL after probes that submit forms, hover tooltips, or
 * otherwise mutate DOM state so later sequential checks see a pristine page.
 */
export async function restorePageAfterMutatingProbes(
  page: Page,
): Promise<void> {
  const url = page.url();
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: GOTO_TIMEOUT_MS,
  });
  await page.waitForTimeout(POST_DOM_SETTLE_MS);
}
