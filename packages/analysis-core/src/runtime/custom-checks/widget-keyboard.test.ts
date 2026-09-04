import { describe, expect, it } from "vitest";
import { isKeyboardFocusable, selectorOf } from "./widget-keyboard-utils";
import { widgetKeyboardViolations } from "./widget-keyboard";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("isKeyboardFocusable", () => {
  it("accepts native interactive elements", () => {
    expect(isKeyboardFocusable(document.createElement("button"))).toBe(true);
    expect(isKeyboardFocusable(document.createElement("a"))).toBe(false);
    const link = document.createElement("a");
    link.href = "/x";
    expect(isKeyboardFocusable(link)).toBe(true);
  });

  it("accepts non-native elements with tabindex >= 0", () => {
    const div = document.createElement("div");
    div.setAttribute("tabindex", "0");
    expect(isKeyboardFocusable(div)).toBe(true);
  });

  it("rejects tabindex -1 and hidden inputs", () => {
    const div = document.createElement("div");
    div.setAttribute("tabindex", "-1");
    expect(isKeyboardFocusable(div)).toBe(false);

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    expect(isKeyboardFocusable(hidden)).toBe(false);
  });
});

describe("selectorOf", () => {
  it("prefers id, then role, then tag", () => {
    const el = document.createElement("div");
    el.id = "menu";
    el.setAttribute("role", "menu");
    expect(selectorOf(el)).toBe("#menu");

    el.removeAttribute("id");
    expect(selectorOf(el)).toBe('[role="menu"]');

    el.removeAttribute("role");
    expect(selectorOf(el)).toBe("div");
  });
});

describe("widgetKeyboardViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a tablist with no focusable tab",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div role="tablist">
            <div role="tab" tabindex="-1">One</div>
            <div role="tab" tabindex="-1">Two</div>
          </div>
        </body></html>
      `);
      try {
        const violations = await widgetKeyboardViolations(page);
        expect(violations.some((v) => v.id === "complyloop-tabs-keyboard")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a tablist with a focusable tab",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div role="tablist">
            <button role="tab" aria-selected="true">One</button>
            <button role="tab" tabindex="-1">Two</button>
          </div>
        </body></html>
      `);
      try {
        const violations = await widgetKeyboardViolations(page);
        expect(violations.some((v) => v.id === "complyloop-tabs-keyboard")).toBe(
          false,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a non-focusable aria-expanded toggle",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div aria-expanded="false" aria-controls="p" style="display:inline-block;background:#eee;">Toggle</div>
          <div id="p">Panel</div>
        </body></html>
      `);
      try {
        const violations = await widgetKeyboardViolations(page);
        expect(
          violations.some((v) => v.id === "complyloop-disclosure-keyboard"),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a button aria-expanded toggle",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <button aria-expanded="false" aria-controls="p">Toggle</button>
          <div id="p">Panel</div>
        </body></html>
      `);
      try {
        const violations = await widgetKeyboardViolations(page);
        expect(
          violations.some((v) => v.id === "complyloop-disclosure-keyboard"),
        ).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a non-focusable menu item",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div role="menu">
            <div role="menuitem">New</div>
            <div role="menuitem">Open</div>
          </div>
        </body></html>
      `);
      try {
        const violations = await widgetKeyboardViolations(page);
        expect(violations.some((v) => v.id === "complyloop-menu-keyboard")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
