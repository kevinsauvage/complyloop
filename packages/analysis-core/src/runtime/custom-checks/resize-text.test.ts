import { describe, expect, it, vi } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { reflowViolation } from "./reflow";
import { resizeTextViolation } from "./resize-text";

registerPlaywrightBrowserTeardown();

describe("resizeTextViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags clipped text after 200% resize at the default viewport",
    async () => {
      await withProbePage(
        `
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
    "ignores overflow-hidden containers whose overflow is decorative",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <article style="position:relative;overflow:hidden;border:1px solid #333;padding:8px">
            <div aria-hidden="true" style="position:absolute;top:-80px;right:-80px;width:200px;height:200px;background:#0e7490;filter:blur(40px)"></div>
            <p>Readable text that always fits its card.</p>
          </article>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores decorative aria-hidden marquees and clipped carousel slides",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <div aria-hidden="true" style="width:200px;overflow:hidden;white-space:nowrap">
            <span style="display:inline-block;width:600px">Free shipping on every order, always</span>
          </div>
          <div role="region" aria-roledescription="carousel" aria-label="Rail">
            <div style="width:200px;overflow:hidden">
              <div style="display:flex;width:600px"><p style="width:200px">One</p><p style="width:200px">Two</p><p style="width:200px">Three</p></div>
            </div>
          </div>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores the text of a collapsed (inert) disclosure panel",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <div role="group" inert style="display:grid;grid-template-rows:0fr;width:300px">
            <div style="overflow:hidden"><p style="margin:0;padding:24px">Answer text that only shows once the question is opened.</p></div>
          </div>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a caption absolutely placed in a fixed-ratio frame, passes the same card built as a growing grid",
    async () => {
      const caption = `<span style="display:block;font-size:0.75rem">Collection</span><h3 style="margin:6px 0 0;font-size:1.5rem">Jewelry Sets</h3><p style="margin:8px 0 0;font-size:0.875rem">Every piece in the collection, gathered in one place for easy browsing and gifting.</p>`;
      await withProbePage(
        `<!doctype html><html lang="en"><body style="margin:0">
          <div style="position:relative;width:246px;aspect-ratio:4/5;overflow:hidden;background:#ddd">
            <div style="position:absolute;left:0;right:0;bottom:0;padding:96px 20px 20px">${caption}</div>
          </div></body></html>`,
        async (page) => {
          expect((await resizeTextViolation(page))?.id).toBe("resize-text");
        },
      );
      await withProbePage(
        `<!doctype html><html lang="en"><body style="margin:0">
          <div style="position:relative;display:grid;grid-template-columns:minmax(0,1fr);width:246px;overflow:hidden;background:#ddd">
            <div style="grid-area:1/1;aspect-ratio:4/5;width:100%"></div>
            <div style="grid-area:1/1;align-self:end;position:relative;padding:96px 20px 20px">${caption}</div>
          </div></body></html>`,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores collapsed inert panels inside an overflow-hidden list",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <div style="overflow:hidden;width:300px;border:1px solid #333">
            <button type="button" aria-expanded="false">Question</button>
            <div inert style="display:grid;grid-template-rows:0fr;opacity:0">
              <div style="overflow:hidden"><p style="margin:0;padding:24px 100px 24px 24px;white-space:nowrap">A long answer that only shows when the question is opened by the visitor.</p></div>
            </div>
          </div>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores sr-only text inside an overflow-hidden button",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        </style></head><body>
          <a href="#" style="position:relative;overflow:hidden;display:inline-block;padding:8px 16px">Docs <span class="sr-only">(opens in a new tab, long hidden label)</span></a>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a line-clamped excerpt that has a disclosure control",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <div style="width:300px">
            <blockquote style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis nostrud.
            </blockquote>
            <button type="button" aria-expanded="false">Read more</button>
          </div>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not count a disclosed excerpt against the card around it",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <article style="overflow:hidden;width:320px;border:1px solid #333">
            <div>
              <blockquote style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin:0">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis nostrud.
              </blockquote>
              <button type="button" aria-expanded="false">Read more</button>
            </div>
          </article>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a card heading that overflows its card at 200%",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <article style="overflow:hidden;width:200px;border:1px solid #333">
            <h3 style="margin:0;font-size:1rem">Collaborativegrowthwithoutbreaks</h3>
          </article>
        </body></html>
      `,
        async (page) => {
          expect((await resizeTextViolation(page))?.id).toBe("resize-text");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a line-clamped excerpt with no way to read the rest",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <blockquote style="width:300px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis nostrud.
          </blockquote>
        </body></html>
      `,
        async (page) => {
          expect((await resizeTextViolation(page))?.id).toBe("resize-text");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text remains readable after resize",
    async () => {
      await withProbePage(
        `
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
      await withProbePage(
        `
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
    "ignores deliberately clipped sr-only content like skip links",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border-width: 0;
          }
        </style></head><body>
          <a href="#main" class="sr-only">Aller au contenu principal de la page</a>
          <main id="main"><p>Contenu flexible sans contrainte.</p></main>
        </body></html>
      `,
        async (page) => {
          expect(await resizeTextViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "clears fontSize even when evaluate throws",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body><p>ok</p></body></html>
      `,
        async (page) => {
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
          });
          vi.spyOn(page, "evaluate").mockImplementationOnce(async () => {
            throw new Error("evaluate failed");
          });
          await expect(resizeTextViolation(page)).rejects.toThrow(
            "evaluate failed",
          );
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
      await withProbePage(
        `
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
