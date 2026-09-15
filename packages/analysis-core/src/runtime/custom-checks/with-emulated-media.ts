import type { Page } from "playwright-core";

type EmulateMediaOptions = Parameters<Page["emulateMedia"]>[0];

/**
 * Emulate a media feature, run `fn`, then restore in `finally` so a thrown
 * evaluate cannot leave the page stuck in forced-colors / reduced-motion.
 */
export async function withEmulatedMedia<T>(
  page: Page,
  active: EmulateMediaOptions,
  reset: EmulateMediaOptions,
  fn: () => Promise<T>,
): Promise<T> {
  await page.emulateMedia(active);
  try {
    return await fn();
  } finally {
    await page.emulateMedia(reset);
  }
}
