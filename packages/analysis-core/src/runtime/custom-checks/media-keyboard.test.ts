import { describe, expect, it } from "vitest";

import { mediaKeyboardViolation } from "./media-keyboard";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

const TINY_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

registerPlaywrightBrowserTeardown();

describe("mediaKeyboardViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags media controls that cannot receive keyboard focus",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <audio controls tabindex="-1" src="${TINY_WAV}"></audio>
        </body></html>
      `,
        async (page) => {
          await page.waitForFunction(() => {
            const media = document.querySelector("audio");
            return media instanceof HTMLMediaElement && media.readyState >= 1;
          });
          const violation = await mediaKeyboardViolation(page);
          expect(violation?.id).toBe("media-keyboard");
          const node = violation!.nodes[0]!;
          expect(node.target).toEqual(["audio"]);
          expect(node.html).toMatch(/^<audio /);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
