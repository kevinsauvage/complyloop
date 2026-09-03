import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { captchaAlternativeViolation } from "./custom-checks/captcha-alternative";
import { forcedColorsViolation } from "./custom-checks/forced-colors";
import { reducedMotionViolation } from "./custom-checks/reduced-motion";
import { errorPreventionViolation } from "./custom-checks/error-prevention";
import { supplementaryContentKeyboardViolation } from "./custom-checks/supplementary-content-keyboard";
import { htmlValidateFindingsForPage } from "./html-validate-runtime";

function chromiumExecutableAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

describe("custom runtime checks (Playwright)", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    await browser?.close();
  });

  async function withPage(html: string) {
    browser ??= await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();
    await page.setContent(html);
    return page;
  }

  it.skipIf(!chromiumExecutableAvailable())(
    "error-prevention flags French checkout without safeguard",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <form action="/paiement">
            <input name="carte" />
            <button type="submit">Payer</button>
          </form>
        </body></html>
      `);
      const violation = await errorPreventionViolation(page);
      expect(violation?.id).toBe("complyloop-error-prevention");
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "captcha-alternative flags captcha without audio fallback",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div class="g-recaptcha" data-sitekey="x"></div>
        </body></html>
      `);
      const violation = await captchaAlternativeViolation(page);
      expect(violation?.id).toBe("complyloop-captcha-alternative");
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "supplementary-content-keyboard flags title-only tooltips",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <a href="/help" title="Aide détaillée sur cette fonctionnalité">Aide</a>
        </body></html>
      `);
      const violation = await supplementaryContentKeyboardViolation(page);
      expect(violation?.id).toBe("complyloop-supplementary-content-keyboard");
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "forced-colors flags a decoration-only control that disappears",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          .icon-btn {
            box-shadow: 0 0 0 2px #000;
            border: 0;
            background: transparent;
          }
          .ok { border: 2px solid #000; background: #fff; }
        </style></head><body>
          <button class="icon-btn" aria-label="Supprimer"></button>
          <button class="ok">Sauvegarder</button>
        </body></html>
      `);
      const violation = await forcedColorsViolation(page);
      expect(violation?.id).toBe("complyloop-forced-colors");
      expect(violation?.nodes.some((n) => n.html.includes("icon-btn"))).toBe(
        true,
      );
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "forced-colors passes controls with a real border",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <button style="border: 2px solid #000; background: #fff;">OK</button>
        </body></html>
      `);
      const violation = await forcedColorsViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reduced-motion flags an animation that ignores the preference",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner" role="status" aria-label="Chargement"></span>
        </body></html>
      `);
      const violation = await reducedMotionViolation(page);
      expect(violation?.id).toBe("complyloop-reduced-motion");
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reduced-motion passes when the animation is disabled via the media query",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none !important; }
          }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner"></span>
        </body></html>
      `);
      const violation = await reducedMotionViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "html-validate rendered pass builds dom findings with offsets from real DOM",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <main id="a"><p>One</p></main>
          <main id="b"><p>Two</p></main>
          <button type="button">Save<button type="button">Nested</button></button>
          <p align="center">Deprecated</p>
        </body></html>
      `);
      const f = await htmlValidateFindingsForPage(page, "https://app.example/page");
      expect(f.every((x) => x.engine === "runtime")).toBe(true);
      expect(f.every((x) => x.location.kind === "dom")).toBe(true);
      // Landmark misuse and deprecated attributes survive browser parsing and
      // are caught on the generated DOM.
      expect(f.some((x) => x.checkId === "landmark-one-main")).toBe(true);
      expect(f.some((x) => x.checkId === "css-for-presentation")).toBe(true);
      // Interactive nesting is a rendered-accessibility defect that the HTML
      // parser auto-repairs, so on the generated DOM it is axe's job, not
      // html-validate's.
      expect(f.some((x) => x.checkId === "nested-interactive")).toBe(false);
      // Selectors must be concrete, not the whole-document fallback.
      const dom = f
        .filter((x) => x.location.kind === "dom")
        .map((x) => x.location as { snippet: string });
      expect(
        dom.every((x) => x.snippet !== "(whole document)"),
      ).toBe(true);
    },
    30_000,
  );
});
