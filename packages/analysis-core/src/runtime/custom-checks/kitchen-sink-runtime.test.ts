import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import type { CheckId } from "../../check-registry.ts";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced";
import { captchaAlternativeViolation } from "./captcha-alternative";
import { cssDisabledContentViolations } from "./css-disabled-content";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard";
import { cssOffUnderstandableViolation } from "./css-off-understandable";
import { dialogFocusViolations } from "./dialog-focus";
import { errorPreventionViolation } from "./error-prevention";
import { focusCustomViolations } from "./focus";
import { forcedColorsViolation } from "./forced-colors";
import { formErrorSubmitViolation } from "./form-error-submit";
import { hoverContentViolation } from "./hover-content";
import { labelAdjacentViolation } from "./label-adjacent";
import { LAYOUT_TABLE_IMPLICIT_BODY } from "./layout-table-fixtures";
import { layoutTableLinearizationViolation } from "./layout-table-linearization";
import { liveRegionUpdatesViolation } from "./live-region-updates";
import { mediaIdentificationViolation } from "./media-identification";
import { mediaKeyboardViolation } from "./media-keyboard";
import { nonTextContrastViolation } from "./non-text-contrast";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { reducedMotionViolation } from "./reduced-motion";
import { reflowViolation } from "./reflow";
import { resizeTextViolation } from "./resize-text";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard";
import { targetSizeEnhancedViolation } from "./target-size-enhanced";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime";
import type { CustomViolation } from "./types";
import { widgetKeyboardViolations } from "./widget-keyboard";

registerPlaywrightBrowserTeardown();

const TINY_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

/**
 * Runtime kitchen-sink: every Playwright custom probe must fire on its
 * dedicated violation page. One `it` per probe id in
 * `CUSTOM_PROBE_CHECK_IDS` — a failing case names the probe whose trigger
 * regressed. Complements the AST kitchen-sink
 * (`src/kitchen-sink-coverage.test.ts`); axe / html-validate / site-level /
 * link coverage lives in `runtime/kitchen-sink-engines.test.ts`.
 */

type Probe = (
  page: Page,
) => Promise<CustomViolation | CustomViolation[] | null>;

async function expectProbeFires(html: string, probe: Probe, id: CheckId) {
  await withProbePage(html, async (page) => {
    const result = await probe(page);
    const violations =
      result == null ? [] : Array.isArray(result) ? result : [result];
    expect(violations.some((violation) => violation.id === id)).toBe(true);
  });
}

function probeCase(id: CheckId, html: string, probe: Probe) {
  it.skipIf(!chromiumExecutableAvailable())(
    `fires ${id}`,
    async () => {
      await expectProbeFires(html, probe, id);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
}

describe("kitchen-sink custom probes", () => {
  probeCase(
    "text-spacing-runtime",
    `<!doctype html><html lang="en"><body>
      <style>#ts{width:150px;height:20px;overflow:hidden;white-space:nowrap}</style>
      <p id="ts">A long line of text that must clip once spacing grows</p>
    </body></html>`,
    textSpacingRuntimeViolation,
  );

  probeCase(
    "non-text-contrast",
    `<!doctype html><html lang="en"><body>
      <button id="ok" style="border:1px solid #eeeeee;background:#ffffff;color:#000000">OK</button>
    </body></html>`,
    nonTextContrastViolation,
  );

  probeCase(
    "label-adjacent",
    `<!doctype html><html lang="en"><body>
      <label for="email">Email address</label>
      <input id="email" style="position:absolute;left:400px" type="email">
    </body></html>`,
    labelAdjacentViolation,
  );

  probeCase(
    "css-disabled-content",
    `<!doctype html><html lang="fr"><body>
      <style>.download::before{content:"Télécharger le document"}</style>
      <span class="download" aria-label="Télécharger"></span>
    </body></html>`,
    cssDisabledContentViolations,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "fires media-keyboard",
    async () => {
      await withProbePage(
        `<!doctype html><html lang="fr"><body>
          <audio controls tabindex="-1" src="${TINY_WAV}"></audio>
        </body></html>`,
        async (page) => {
          await page.waitForFunction(() => {
            const media = document.querySelector("audio");
            return media instanceof HTMLMediaElement && media.readyState >= 1;
          });
          const violation = await mediaKeyboardViolation(page);
          expect(violation?.id).toBe("media-keyboard");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  probeCase(
    "css-hover-keyboard",
    `<!doctype html><html lang="en"><body>
      <style>.menu .panel{display:none}.menu:hover .panel{display:block}</style>
      <div class="menu"><button>Menu</button><div class="panel">Panel content</div></div>
    </body></html>`,
    cssHoverKeyboardViolation,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "fires layout-table-linearization",
    async () => {
      await withProbePage(
        `<!doctype html><html lang="fr"><head><style>
          table { position: relative; width: 240px; height: 80px; border-collapse: collapse; }
          td { position: absolute; width: 110px; height: 30px; }
          td:nth-child(1) { left: 120px; top: 0; }
          td:nth-child(2) { left: 0; top: 0; }
          td:nth-child(3) { left: 120px; top: 40px; }
          td:nth-child(4) { left: 0; top: 40px; }
        </style></head><body>
          ${LAYOUT_TABLE_IMPLICIT_BODY}
        </body></html>`,
        async (page) => {
          const violation = await layoutTableLinearizationViolation(page);
          expect(violation?.id).toBe("layout-table-linearization");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  probeCase(
    "error-prevention",
    `<!doctype html><html lang="fr"><body>
      <form action="/paiement"><input name="carte" aria-label="Carte"><button>Payer</button></form>
    </body></html>`,
    errorPreventionViolation,
  );

  probeCase(
    "captcha-alternative",
    `<!doctype html><html lang="en"><body>
      <form><div class="g-recaptcha" data-sitekey="test-key"></div><button>Submit</button></form>
    </body></html>`,
    captchaAlternativeViolation,
  );

  probeCase(
    "accessible-auth-enhanced",
    `<!doctype html><html lang="fr"><body>
      <form><input type="password" aria-label="Mot de passe"><button>Se connecter</button></form>
      <iframe title="Sélectionnez les feux tricolores"></iframe>
    </body></html>`,
    accessibleAuthEnhancedViolation,
  );

  probeCase(
    "media-identification",
    `<!doctype html><html lang="fr"><body>
      <object data="/x.pdf"></object>
      <canvas id="c"></canvas>
    </body></html>`,
    mediaIdentificationViolation,
  );

  probeCase(
    "supplementary-content-keyboard",
    `<!doctype html><html lang="en"><body>
      <a href="/help" title="Detailed help about this page, only on hover">Help</a>
    </body></html>`,
    supplementaryContentKeyboardViolation,
  );

  probeCase(
    "focus-visible",
    `<!doctype html><html lang="en"><body>
      <style>#go:focus{outline:none;box-shadow:none}</style>
      <button id="go">Go</button>
    </body></html>`,
    focusCustomViolations,
  );

  probeCase(
    "focus-not-obscured",
    `<!doctype html><html lang="en"><body>
      <style>#cover{position:fixed;inset:0;background:white;z-index:9999}</style>
      <button id="go">Go</button>
      <div id="cover">Overlay</div>
    </body></html>`,
    focusCustomViolations,
  );

  probeCase(
    "focus-not-obscured-enhanced",
    `<!doctype html><html lang="en"><body>
      <style>#cover{position:fixed;inset:0;background:white;z-index:9999}</style>
      <button id="go">Go</button>
      <div id="cover">Overlay</div>
    </body></html>`,
    focusCustomViolations,
  );

  probeCase(
    "focus-appearance",
    `<!doctype html><html lang="en"><body>
      <style>#go:focus{outline:1px dotted #fefefe;outline-offset:0}</style>
      <button id="go">Go</button>
    </body></html>`,
    focusCustomViolations,
  );

  probeCase(
    "keyboard-trap",
    `<!doctype html><html lang="en"><body>
      <button id="a">First</button>
      <button id="b">Second</button>
      <button id="c">Never reached</button>
      <script>
        const a = document.getElementById("a");
        const b = document.getElementById("b");
        b.addEventListener("keydown", (e) => {
          if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); a.focus(); }
        });
        a.addEventListener("keydown", (e) => {
          if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); b.focus(); }
        });
      </script>
    </body></html>`,
    focusCustomViolations,
  );

  probeCase(
    "dialog-keyboard",
    `<!doctype html><html lang="en"><body>
      <button id="open">Open dialog</button>
      <div role="dialog" data-trigger="#open" aria-label="Settings">
        <button>Close</button>
      </div>
    </body></html>`,
    dialogFocusViolations,
  );

  probeCase(
    "tabs-keyboard",
    `<!doctype html><html lang="en"><body>
      <div role="tablist"><div role="tab" tabindex="-1">Tab one</div><div role="tab" tabindex="-1">Tab two</div></div>
    </body></html>`,
    widgetKeyboardViolations,
  );

  probeCase(
    "disclosure-keyboard",
    `<!doctype html><html lang="fr"><body>
      <div aria-expanded="false" aria-controls="p" style="display:inline-block;background:#eee;">Toggle</div>
      <div id="p">Panel</div>
    </body></html>`,
    widgetKeyboardViolations,
  );

  probeCase(
    "menu-keyboard",
    `<!doctype html><html lang="en"><body>
      <div role="menu"><div role="menuitem">First</div><div role="menuitem">Second</div></div>
    </body></html>`,
    widgetKeyboardViolations,
  );

  probeCase(
    "css-off-understandable",
    `<!doctype html><html lang="fr"><body>
      <style>.row{display:flex}.a{order:2}.b{order:1}</style>
      <div class="row"><p class="a">Premier paragraphe affiché en second.</p><p class="b">Deuxième paragraphe affiché en premier.</p></div>
    </body></html>`,
    cssOffUnderstandableViolation,
  );

  probeCase(
    "form-error-association",
    `<!doctype html><html lang="en"><body>
      <form id="signup"><input id="email" type="email" required aria-label="Email"><p id="email-error" hidden>Enter an email.</p><button>Sign up</button></form>
    </body></html>`,
    formErrorSubmitViolation,
  );

  probeCase(
    "live-region-updates",
    `<!doctype html><html lang="en"><body>
      <form id="signup">
        <label>Email <input id="email" type="email" required value="not-an-email" /></label>
        <button type="submit">Send</button>
      </form>
      <p id="status" style="display:none">Email is invalid</p>
      <script>
        const email = document.getElementById("email");
        email.addEventListener("invalid", (event) => {
          event.preventDefault();
          document.getElementById("status").style.display = "block";
        });
      </script>
    </body></html>`,
    liveRegionUpdatesViolation,
  );

  probeCase(
    "hover-content",
    `<!doctype html><html lang="fr"><head><style>
      .tip { position: relative; display: inline-block; }
      .tip .panel {
        display: none;
        position: absolute;
        background: #fff;
        border: 1px solid #000;
        padding: 8px;
      }
      .tip:hover .panel { display: block; }
    </style></head><body>
      <span class="tip" title="More info">
        Help
        <span class="panel">Extended help text only on hover.</span>
      </span>
    </body></html>`,
    hoverContentViolation,
  );

  probeCase(
    "forced-colors",
    `<!doctype html><html lang="fr"><head><style>
      .icon-btn {
        box-shadow: 0 0 0 2px #000;
        border: 0;
        background: transparent;
      }
    </style></head><body>
      <button class="icon-btn" aria-label="Supprimer"></button>
    </body></html>`,
    forcedColorsViolation,
  );

  probeCase(
    "reduced-motion",
    `<!doctype html><html lang="en"><body>
      <style>.spinner{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
      <div class="spinner">Loading</div>
    </body></html>`,
    reducedMotionViolation,
  );

  probeCase(
    "reflow",
    `<!doctype html><html lang="fr"><body>
      <div id="wide" style="width:800px">Wide content that cannot wrap.</div>
    </body></html>`,
    reflowViolation,
  );

  probeCase(
    "resize-text",
    `<!doctype html><html lang="en"><body>
      <div id="clip" style="width:400px;overflow:hidden;white-space:nowrap">A long line of text that clips after the 200 percent resize</div>
    </body></html>`,
    resizeTextViolation,
  );

  probeCase(
    "target-size-enhanced",
    `<!doctype html><html lang="en"><body>
      <style>.small{width:32px;height:32px;padding:0}</style>
      <button class="small" aria-label="Close">X</button>
    </body></html>`,
    targetSizeEnhancedViolation,
  );
});
