import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { captchaAlternativeViolation } from "./captcha-alternative";
import { errorPreventionViolation } from "./error-prevention";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard";

function chromiumExecutableAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

describe("wave-1 custom runtime checks", () => {
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
});
