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
    const selfClosing = m[3] === "/";
    elements.push({ offset: m.index, selector: m[1].toLowerCase(), html: m[0] });
    if (selfClosing) continue;
  }
  return { html, elements };
}

const URL = "https://app.example/";

describe("html-validate rendered pass", () => {
  it("does not emit findings for multiple main (landmarks are axe-owned)", () => {
    const s = serialized(
      `<html><body><main id="a"><p>x</p></main><main id="b"><p>y</p></main></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "landmark-one-main")).toBe(false);
    expect(f.some((x) => x.checkId === "landmark-unique")).toBe(false);
  });

  it("maps content-model violations and css-for-presentation", () => {
    const s = serialized(
      `<html><body><button type="button">a<button type="button">b</button></button><table><td>x</td></table><p align="center">y</p></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
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
          <span id="dup"></span><span id="dup"></span>
          <p align="center">Deprecated</p>
        </body></html>
      `);
      try {
        const f = await htmlValidateFindingsForPage(page, "https://app.example/page");
        expect(f.every((x) => x.engine === "runtime")).toBe(true);
        expect(f.every((x) => x.location.kind === "dom")).toBe(true);
        expect(f.some((x) => x.checkId === "landmark-one-main")).toBe(false);
        expect(f.some((x) => x.checkId === "css-for-presentation")).toBe(true);
        expect(f.some((x) => x.checkId === "duplicate-id")).toBe(false);
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

  it("does not emit duplicate-id (axe owns id uniqueness on the rendered DOM)", () => {
    const s = serialized(
      `<html><body><span id="d"></span><span id="d"></span></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "duplicate-id")).toBe(false);
  });

  it("does not emit form-error-association for broken idrefs (axe-owned)", () => {
    const brokenFor = serialized(
      `<html><body><label for="missing">Email</label></body></html>`,
    );
    expect(
      htmlValidateFindingsFromSerialized(brokenFor, URL).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(false);

    const brokenDescribedBy = serialized(
      `<html><body><input aria-describedby="gone" /></body></html>`,
    );
    expect(
      htmlValidateFindingsFromSerialized(brokenDescribedBy, URL).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(false);
  });

  it("only emits markup-nesting and css-for-presentation", () => {
    const s = serialized(
      `<html><body><main id="a"></main><main id="b"></main><label for="x">x</label><p align="center">y</p><span id="d"></span><span id="d"></span></body></html>`,
    );
    const checkIds = new Set(
      htmlValidateFindingsFromSerialized(s, URL).map((f) => f.checkId),
    );
    for (const id of checkIds) {
      expect(["markup-nesting", "css-for-presentation"]).toContain(id);
    }
  });
});

describe("checkIdForHtmlValidateRule", () => {
  it("maps 8.2 / 10.1 rules only", () => {
    expect(checkIdForHtmlValidateRule("no-deprecated-attr")).toBe(
      "css-for-presentation",
    );
    expect(checkIdForHtmlValidateRule("deprecated")).toBe("css-for-presentation");
    expect(checkIdForHtmlValidateRule("no-dup-attr")).toBe("markup-nesting");
    expect(checkIdForHtmlValidateRule("element-permitted-content")).toBe(
      "markup-nesting",
    );
    expect(checkIdForHtmlValidateRule("not-a-rule")).toBeUndefined();
  });

  it("does not map duplicate-id, landmark, or idref rules", () => {
    expect(checkIdForHtmlValidateRule("no-dup-id")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("no-multiple-main")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("unique-landmark")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("no-missing-references")).toBeUndefined();
  });
});
