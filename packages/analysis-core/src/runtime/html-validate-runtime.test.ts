import { describe, expect, it } from "vitest";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import {
  htmlValidateFindingsForPage,
  htmlValidateFindingsFromSerialized,
} from "./html-validate-runtime";

registerPlaywrightBrowserTeardown();
import type { SerializeDocumentResult } from "./html-validate-runtime";
import { checkIdForHtmlValidateRule } from "./html-validate-map";

/**
 * Builds a SerializeDocumentResult from a one-line HTML string, recording each
 * element's start-tag offset (mirrors the in-page serializer's offset logic).
 * Used to drive htmlValidateFindingsFromSerialized without a browser.
 */
function serialized(html: string): SerializeDocumentResult {
  const elements = [];
  const re = /<([a-z][a-z0-9-]*)((?:\s+[^>]*?)?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const selfClosing = m[3] === "/";
    // Skip text nodes / attribute-only matches; record element start offsets.
    elements.push({ offset: m.index, selector: tag, html: m[0] });
    if (selfClosing) continue;
  }
  return { html, elements };
}

const URL = "https://app.example/";

describe("html-validate rendered pass", () => {
  it("does not flag a single-main document", () => {
    const s = serialized(`<html><body><main><p>x</p></main></body></html>`);
    const f = htmlValidateFindingsFromSerialized(s, URL);
    const main = f.filter((x) => x.checkId === "landmark-one-main");
    expect(main.length).toBe(0);
  });

  it("reports multiple <main> with a dom location and runtime engine", () => {
    const s = serialized(
      `<html><body><main id="a"><p>x</p></main><main id="b"><p>y</p></main></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    const main = f.find((x) => x.checkId === "landmark-one-main");
    expect(main).toBeDefined();
    expect(main?.engine).toBe("runtime");
    expect(main?.location.kind).toBe("dom");
    if (main?.location.kind === "dom") {
      expect(main.location.url).toBe(URL);
      expect(main.location.selector.length).toBeGreaterThan(0);
    }
  });

  it("maps content-model violations and css-for-presentation", () => {
    const s = serialized(
      `<html><body><button type="button">a<button type="button">b</button></button><table><td>x</td></table><p align="center">y</p></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    // element-permitted-content (interactive or otherwise) ⇒ markup-nesting.
    expect(f.some((x) => x.checkId === "markup-nesting")).toBe(true);
    expect(f.some((x) => x.checkId === "nested-interactive")).toBe(false);
    const dep = f.find((x) => x.checkId === "css-for-presentation");
    expect(dep?.severity).toBe("moderate");
    expect(dep?.engine).toBe("runtime");
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "builds dom findings with offsets from real DOM",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <main id="a"><p>One</p></main>
          <main id="b"><p>Two</p></main>
          <button type="button">Save<button type="button">Nested</button></button>
          <p align="center">Deprecated</p>
        </body></html>
      `);
      try {
        const f = await htmlValidateFindingsForPage(page, "https://app.example/page");
        expect(f.every((x) => x.engine === "runtime")).toBe(true);
        expect(f.every((x) => x.location.kind === "dom")).toBe(true);
        expect(f.some((x) => x.checkId === "landmark-one-main")).toBe(true);
        expect(f.some((x) => x.checkId === "css-for-presentation")).toBe(true);
        expect(f.some((x) => x.checkId === "nested-interactive")).toBe(false);
        const dom = f
          .filter((x) => x.location.kind === "dom")
          .map((x) => x.location as { snippet: string });
        expect(dom.every((x) => x.snippet !== "(whole document)")).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it("reports duplicate ids under no-dup-id → duplicate-id", () => {
    const s = serialized(
      `<html><body><span id="d"></span><span id="d"></span></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "duplicate-id")).toBe(true);
    expect(f.some((x) => x.engine === "runtime")).toBe(true);
  });

  it("reports broken for and aria-describedby as form-error-association", () => {
    const brokenFor = serialized(
      `<html><body><label for="missing">Email</label></body></html>`,
    );
    expect(
      htmlValidateFindingsFromSerialized(brokenFor, URL).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(true);

    const brokenDescribedBy = serialized(
      `<html><body><input aria-describedby="gone" /></body></html>`,
    );
    expect(
      htmlValidateFindingsFromSerialized(brokenDescribedBy, URL).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(true);

    const ok = serialized(
      `<html><body><label for="e">Email</label><input id="e" /></body></html>`,
    );
    expect(
      htmlValidateFindingsFromSerialized(ok, URL).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(false);
  });
});

describe("checkIdForHtmlValidateRule", () => {
  it("maps rendered-pass rules to check ids", () => {
    expect(checkIdForHtmlValidateRule("no-multiple-main")).toBe(
      "landmark-one-main",
    );
    expect(checkIdForHtmlValidateRule("unique-landmark")).toBe(
      "landmark-unique",
    );
    expect(checkIdForHtmlValidateRule("no-dup-id")).toBe("duplicate-id");
    expect(checkIdForHtmlValidateRule("no-deprecated-attr")).toBe(
      "css-for-presentation",
    );
    expect(checkIdForHtmlValidateRule("deprecated")).toBe(
      "css-for-presentation",
    );
    expect(checkIdForHtmlValidateRule("no-dup-attr")).toBe("markup-nesting");
    expect(checkIdForHtmlValidateRule("element-permitted-content")).toBe(
      "markup-nesting",
    );
    expect(checkIdForHtmlValidateRule("no-missing-references")).toBe(
      "form-error-association",
    );
    expect(checkIdForHtmlValidateRule("not-a-rule")).toBeUndefined();
  });
});