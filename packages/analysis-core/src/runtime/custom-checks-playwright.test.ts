import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { captchaAlternativeViolation } from "./custom-checks/captcha-alternative";
import { forcedColorsViolation } from "./custom-checks/forced-colors";
import { reducedMotionViolation } from "./custom-checks/reduced-motion";
import { errorPreventionViolation } from "./custom-checks/error-prevention";
import { supplementaryContentKeyboardViolation } from "./custom-checks/supplementary-content-keyboard";
import { htmlValidateFindingsForPage } from "./html-validate-runtime";
import { dialogFocusViolations } from "./custom-checks/dialog-focus";
import { announcementViolations } from "./custom-checks/announcement";
import { widgetKeyboardViolations } from "./custom-checks/widget-keyboard";
import { formErrorRuntimeViolation } from "./custom-checks/form-error-runtime";
import { focusCustomViolations } from "./custom-checks/focus";
import { reflowViolation } from "./custom-checks/reflow";

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

  it.skipIf(!chromiumExecutableAvailable())(
    "dialog-focus flags a modal that does not move focus in",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <button id="open" data-open="d">Open</button>
          <div id="d" role="dialog" aria-modal="true" data-trigger="#open">
            <button id="inside">Inside</button>
          </div>
        </body></html>
      `);
      // Focus is on the trigger after click; the dialog is open in the DOM but
      // focus was NOT moved into it (broken focus management).
      await page.focus("#open");
      const violations = await dialogFocusViolations(page);
      expect(violations.some((v) => v.id === "complyloop-dialog-focus")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "announcement flags a hidden live region",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div aria-live="polite" style="display:none" id="sr-status">Error: x</div>
          <div role="status">Okay</div>
        </body></html>
      `);
      const violation = await announcementViolations(page);
      expect(violation?.id).toBe("complyloop-announcement");
      expect(violation?.nodes.some((n) => n.html.includes("aria-live"))).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "widget-keyboard flags a tablist with no focusable tab",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div role="tablist">
            <div role="tab" tabindex="-1">One</div>
            <div role="tab" tabindex="-1">Two</div>
          </div>
        </body></html>
      `);
      const violations = await widgetKeyboardViolations(page);
      expect(violations.some((v) => v.id === "complyloop-tabs-keyboard")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "widget-keyboard passes a tablist with a focusable tab",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div role="tablist">
            <button role="tab" aria-selected="true">One</button>
            <button role="tab" tabindex="-1">Two</button>
          </div>
        </body></html>
      `);
      const violations = await widgetKeyboardViolations(page);
      expect(violations.some((v) => v.id === "complyloop-tabs-keyboard")).toBe(false);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "widget-keyboard flags a non-focusable aria-expanded toggle",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div aria-expanded="false" aria-controls="p" style="display:inline-block;background:#eee;">Toggle</div>
          <div id="p">Panel</div>
        </body></html>
      `);
      const violations = await widgetKeyboardViolations(page);
      expect(violations.some((v) => v.id === "complyloop-disclosure-keyboard")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "widget-keyboard passes a button aria-expanded toggle",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <button aria-expanded="false" aria-controls="p">Toggle</button>
          <div id="p">Panel</div>
        </body></html>
      `);
      const violations = await widgetKeyboardViolations(page);
      expect(violations.some((v) => v.id === "complyloop-disclosure-keyboard")).toBe(false);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "widget-keyboard flags a non-focusable menu item",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div role="menu">
            <div role="menuitem">New</div>
            <div role="menuitem">Open</div>
          </div>
        </body></html>
      `);
      const violations = await widgetKeyboardViolations(page);
      expect(violations.some((v) => v.id === "complyloop-menu-keyboard")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "form-error-runtime flags an invalid field with no associated error",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="e">Email</label>
            <input id="e" type="email" aria-invalid="true" />
          </form>
        </body></html>
      `);
      const violation = await formErrorRuntimeViolation(page);
      expect(violation?.id).toBe("complyloop-form-error-association");
      expect(violation?.nodes.some((n) => n.html.includes("aria-invalid"))).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "form-error-runtime passes an invalid field with a described error",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="e">Email</label>
            <input id="e" type="email" aria-invalid="true" aria-describedby="e-err" />
            <div id="e-err">Adresse email invalide</div>
          </form>
        </body></html>
      `);
      const violation = await formErrorRuntimeViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "form-error-runtime passes a healthy form with no invalid fields",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="e">Email</label>
            <input id="e" type="email" aria-invalid="false" />
          </form>
        </body></html>
      `);
      const violation = await formErrorRuntimeViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a control whose appearance does not change on focus",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          button:focus, button:focus-visible {
            outline: none;
            box-shadow: none;
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `);
      const violations = await focusCustomViolations(page);
      expect(violations.some((v) => v.id === "complyloop-focus-visible")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible accepts a border change as the indicator",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          button {
            outline: none;
            border: 1px solid #ccc;
          }
          button:focus-visible {
            outline: none;
            border-color: #0050ff;
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `);
      const violations = await focusCustomViolations(page);
      expect(violations.some((v) => v.id === "complyloop-focus-visible")).toBe(false);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a persistent shadow that is not a focus indicator",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><head><style>
          button, button:focus, button:focus-visible {
            outline: none;
            box-shadow: 0 1px 2px rgb(0, 0, 0);
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `);
      const violations = await focusCustomViolations(page);
      expect(violations.some((v) => v.id === "complyloop-focus-visible")).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reflow flags a non-exempt wide container at 320px",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <div id="wide" style="width:800px">Wide content that cannot wrap.</div>
        </body></html>
      `);
      const violation = await reflowViolation(page);
      expect(violation?.id).toBe("complyloop-reflow");
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reflow passes a wide data table (2D exception)",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <table id="data">
            <tr><td style="width:400px">A</td><td style="width:400px">B</td></tr>
          </table>
        </body></html>
      `);
      const violation = await reflowViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reflow passes a wide image (2D exception)",
    async () => {
      const page = await withPage(`
        <!doctype html><html lang="fr"><body>
          <img id="chart" width="800" height="20" alt="chart"
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        </body></html>
      `);
      const violation = await reflowViolation(page);
      expect(violation).toBeNull();
    },
    30_000,
  );
});
