import { describe, expect, it } from "vitest";
import { mediaIdentificationViolation } from "./media-identification";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("mediaIdentificationViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags nameless canvas, not unlabeled object",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <object data="/x.pdf"></object>
          <canvas id="c"></canvas>
        </body></html>
      `);
      try {
        const violation = await mediaIdentificationViolation(page);
        expect(violation?.id).toBe("media-identification");
        expect(violation?.nodes.some((n) => n.html.includes("canvas"))).toBe(
          true,
        );
        expect(violation?.nodes.some((n) => n.html.includes("object"))).toBe(
          false,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
