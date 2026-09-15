import type { Page } from "playwright";

/** Mobile viewport for WCAG 2.5.8 / target-size condition pass. */
export const MOBILE_VIEWPORT = { width: 320, height: 568 } as const;

export const TARGET_SIZE_AXE_RULE = "target-size";

export const MOBILE_TARGET_SIZE_LABEL = "320×568";

/** Touch-primary pointer — CSS `@media (pointer: coarse)` layouts. */
export const COARSE_POINTER_LABEL = "pointer: coarse";

/** WCAG 2.5.5 Target Size (Enhanced) — AAA, separate from 24×24 AA. */
export const TARGET_SIZE_ENHANCED_MIN_PX = 44;

/**
 * Emulates a coarse primary pointer (touch) then restores the default
 * fine pointer. Playwright's `emulateMedia` does not expose `pointer`;
 * Chromium reports `pointer: coarse` under mobile + touch emulation.
 */
export async function emulateCoarsePointer<T>(
  page: Page,
  run: () => Promise<T>,
): Promise<T> {
  const session = await page.context().newCDPSession(page);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  try {
    return await run();
  } finally {
    await session.send("Emulation.setTouchEmulationEnabled", {
      enabled: false,
    });
    await session.send("Emulation.clearDeviceMetricsOverride");
    await session.detach();
  }
}
