import type { Locator, Page } from "playwright";

export async function bodyTextLength(page: Page): Promise<number> {
  return page.evaluate(() => document.body.innerText.length);
}

/**
 * Measures body text length before hover, after hover, and after focus on the
 * same trigger. Resets the pointer to (0, 0) when finished.
 */
export async function measureHoverVsFocusReveal(
  page: Page,
  trigger: Locator,
  options: { waitMs?: number } = {},
): Promise<{ beforeLen: number; hoverLen: number; focusLen: number }> {
  const waitMs = options.waitMs ?? 0;
  const beforeLen = await bodyTextLength(page);
  await trigger.hover();
  if (waitMs) await page.waitForTimeout(waitMs);
  const hoverLen = await bodyTextLength(page);
  await trigger.focus();
  if (waitMs) await page.waitForTimeout(waitMs);
  const focusLen = await bodyTextLength(page);
  await page.mouse.move(0, 0);
  return { beforeLen, hoverLen, focusLen };
}
