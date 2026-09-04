import { describe, expect, it } from "vitest";
import { mediaKeyboardViolation } from "./media-keyboard";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

const TINY_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

registerPlaywrightBrowserTeardown();

describe("mediaKeyboardViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags media controls that cannot receive keyboard focus",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <audio controls tabindex="-1" src="${TINY_WAV}"></audio>
        </body></html>
      `);
      try {
        await page.waitForFunction(() => {
          const media = document.querySelector("audio");
          return media instanceof HTMLMediaElement && media.readyState >= 1;
        });
        const violation = await mediaKeyboardViolation(page);
        expect(violation?.id).toBe("complyloop-media-keyboard");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
