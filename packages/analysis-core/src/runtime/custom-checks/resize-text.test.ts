import { describe, expect, it, vi } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";
import { reflowViolation } from "./reflow";
import { resizeTextViolation } from "./resize-text";

registerPlaywrightBrowserTeardown();

describe("resizeTextViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags clipped text after 200% resize at the default viewport",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:400px;overflow:hidden;white-space:nowrap;font-size:16px;">
            Texte très long qui déborde horizontalement après agrandissement à deux cents pourcent.
          </div>
        </body></html>
      `,
        async (page) => {
        const violation = await resizeTextViolation(page);
        expect(violation?.id).toBe("resize-text");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text remains readable after resize",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <p>Texte flexible sans contrainte de hauteur fixe.</p>
        </body></html>
      `,
        async (page) => {
        const violation = await resizeTextViolation(page);
        expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag viewport-only overflow without a clipped text node",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:350px">Only wide at narrow viewports.</div>
        </body></html>
      `,
        async (page) => {
        const resize = await resizeTextViolation(page);
        expect(resize).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "clears fontSize even when evaluate throws",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body><p>ok</p></body></html>
      `,
        async (page) => {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        vi.spyOn(page, "evaluate").mockImplementationOnce(async () => {
          throw new Error("evaluate failed");
        });
        await expect(resizeTextViolation(page)).rejects.toThrow("evaluate failed");
        const fontSize = await page.evaluate(
          () => document.documentElement.style.fontSize,
        );
        expect(fontSize).toBe("");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("resize vs reflow separation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags reflow but not resize when only 320px viewport overflows",
    async () => {
      await withProbePage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:350px">Only wide at narrow viewports.</div>
        </body></html>
      `,
        async (page) => {
        expect(await resizeTextViolation(page)).toBeNull();
        expect((await reflowViolation(page))?.id).toBe("reflow");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
