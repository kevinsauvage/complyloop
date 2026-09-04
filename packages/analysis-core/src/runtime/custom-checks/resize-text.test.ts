import { describe, expect, it, vi } from "vitest";
import { resizeTextViolation } from "./resize-text";
import { reflowViolation } from "./reflow";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("resizeTextViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags clipped text after 200% resize at the default viewport",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:400px;overflow:hidden;white-space:nowrap;font-size:16px;">
            Texte très long qui déborde horizontalement après agrandissement à deux cents pourcent.
          </div>
        </body></html>
      `);
      try {
        const violation = await resizeTextViolation(page);
        expect(violation?.id).toBe("complyloop-resize-text");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text remains readable after resize",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <p>Texte flexible sans contrainte de hauteur fixe.</p>
        </body></html>
      `);
      try {
        const violation = await resizeTextViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag viewport-only overflow without a clipped text node",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:350px">Only wide at narrow viewports.</div>
        </body></html>
      `);
      try {
        const resize = await resizeTextViolation(page);
        expect(resize).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "clears fontSize even when evaluate throws",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body><p>ok</p></body></html>
      `);
      try {
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
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("resize vs reflow separation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags reflow but not resize when only 320px viewport overflows",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:350px">Only wide at narrow viewports.</div>
        </body></html>
      `);
      try {
        expect(await resizeTextViolation(page)).toBeNull();
        expect((await reflowViolation(page))?.id).toBe("complyloop-reflow");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
