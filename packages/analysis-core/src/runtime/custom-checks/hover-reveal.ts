import type { Locator, Page } from "playwright";

async function bodyTextLength(page: Page): Promise<number> {
  return page.evaluate(() => document.body.innerText.length);
}

type HoverRevealMeasure = {
  beforeLen: number;
  hoverLen: number;
  focusLen: number;
  /** Present when `checkEscape` was requested (length after Escape, before focus). */
  afterEscapeLen?: number;
};

/**
 * Measures body text length before hover, after hover, and after focus on the
 * same trigger. Optionally probes Escape dismissal between hover and focus.
 * Resets the pointer to (0, 0) when finished.
 */
export async function measureHoverVsFocusReveal(
  page: Page,
  trigger: Locator,
  options: { waitMs?: number; checkEscape?: boolean } = {},
): Promise<HoverRevealMeasure> {
  const waitMs = options.waitMs ?? 0;
  const beforeLen = await bodyTextLength(page);
  await trigger.hover();
  if (waitMs) await page.waitForTimeout(waitMs);
  const hoverLen = await bodyTextLength(page);

  let afterEscapeLen: number | undefined;
  if (options.checkEscape) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    afterEscapeLen = await bodyTextLength(page);
  }

  await trigger.focus();
  if (waitMs) await page.waitForTimeout(waitMs);
  const focusLen = await bodyTextLength(page);
  await page.mouse.move(0, 0);
  return { beforeLen, hoverLen, focusLen, afterEscapeLen };
}
