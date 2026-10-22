import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";
import {
  HTML_VALIDATE_INPUT_KIND,
  HTML_VALIDATE_RENDERED_RULE_IDS,
  htmlValidateFindingsForPage,
  htmlValidateFindingsFromSerialized,
} from "./html-validate-runtime";

registerPlaywrightBrowserTeardown();
import {
  checkIdForHtmlValidateRule,
  HTML_VALIDATE_TO_CHECK_RULE_IDS,
} from "./html-validate-map";
import type { SerializeDocumentResult } from "./html-validate-runtime";

/**
 * Builds a SerializeDocumentResult from a one-line HTML string, recording each
 * element's start-tag offset (mirrors the in-page serializer's offset logic).
 * Used to drive htmlValidateFindingsFromSerialized without a browser.
 */
function serialized(html: string): SerializeDocumentResult {
  const elements: Array<{
    offset: number;
    closeEndOffset?: number;
    selector: string;
    html: string;
    tag: string;
  }> = [];
  const re = /<(\/?)([a-z][a-z0-9-]*)((?:\s+[^>]*?)?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    if (closing) {
      for (let index = elements.length - 1; index >= 0; index -= 1) {
        const candidate = elements[index]!;
        if (candidate.tag === tag && candidate.closeEndOffset === undefined) {
          candidate.closeEndOffset = m.index + m[0].length;
          break;
        }
      }
      continue;
    }
    const selfClosing = m[4] === "/";
    elements.push({
      offset: m.index,
      tag,
      selector: tag,
      html: m[0],
      closeEndOffset: selfClosing ? m.index + m[0].length : undefined,
    });
  }
  return {
    html,
    elements: elements.map(({ tag, ...element }) => {
      void tag;
      return element;
    }),
  };
}

const URL = "https://app.example/";

describe("html-validate rendered pass", () => {
  it("does not emit findings for multiple main (landmarks are axe-owned)", async () => {
    const s = serialized(
      `<html><body><main id="a"><p>x</p></main><main id="b"><p>y</p></main></body></html>`,
    );
    const f = await htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "landmark-one-main")).toBe(false);
    expect(f.some((x) => x.checkId === "landmark-unique")).toBe(false);
  });

  it("maps content-model violations and css-for-presentation", async () => {
    const s = serialized(
      `<html><body><button type="button">a<button type="button">b</button></button><table><td>x</td></table><p align="center">y</p></body></html>`,
    );
    const f = await htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "markup-nesting")).toBe(true);
    expect(f.some((x) => x.checkId === "nested-interactive")).toBe(false);
    const dep = f.find((x) => x.checkId === "css-for-presentation");
    expect(dep?.severity).toBe("moderate");
    expect(dep?.analyzerId).toBe("html-validate");
    const nesting = f.find((x) => x.checkId === "markup-nesting");
    expect(nesting?.confidence).toBe("medium");
    expect(nesting?.validationInput).toBe(HTML_VALIDATE_INPUT_KIND);
    expect(nesting?.validationRules).toEqual(HTML_VALIDATE_RENDERED_RULE_IDS);
    expect(nesting?.doctypeIncludedInInput).toBe(false);
    expect(nesting?.reason).toMatch(/Live DOM serialization/);
    expect(nesting?.reason).not.toMatch(/source HTML is valid/i);
  });

  it("maps closing-tag messages to the element being closed, not a later sibling", async () => {
    const s = serialized(
      `<html><body><button type="button">a<button type="button">b</button></button><p id="after">later</p></body></html>`,
    );
    const f = await htmlValidateFindingsFromSerialized(s, URL);
    const nesting = f.find((x) => x.checkId === "markup-nesting");
    expect(nesting).toBeDefined();
    expect(nesting?.location.kind).toBe("dom");
    if (nesting?.location.kind !== "dom") return;
    expect(nesting.location.selector).toBe("button");
    expect(nesting.location.selector).not.toBe("p");
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
        const f = await htmlValidateFindingsForPage(
          page,
          "https://app.example/page",
        );
        expect(f.every((x) => x.analyzerId === "html-validate")).toBe(true);
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

  it("does not emit duplicate-id (axe owns id uniqueness on the rendered DOM)", async () => {
    const s = serialized(
      `<html><body><span id="d"></span><span id="d"></span></body></html>`,
    );
    const f = await htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "duplicate-id")).toBe(false);
  });

  it("does not emit form-error-association for broken idrefs (axe-owned)", async () => {
    const brokenFor = serialized(
      `<html><body><label for="missing">Email</label></body></html>`,
    );
    expect(
      (await htmlValidateFindingsFromSerialized(brokenFor, URL)).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(false);

    const brokenDescribedBy = serialized(
      `<html><body><input aria-describedby="gone" /></body></html>`,
    );
    expect(
      (await htmlValidateFindingsFromSerialized(brokenDescribedBy, URL)).some(
        (x) => x.checkId === "form-error-association",
      ),
    ).toBe(false);
  });

  it("only emits markup-nesting and css-for-presentation", async () => {
    const s = serialized(
      `<html><body><main id="a"></main><main id="b"></main><label for="x">x</label><p align="center">y</p><span id="d"></span><span id="d"></span></body></html>`,
    );
    const checkIds = new Set(
      (await htmlValidateFindingsFromSerialized(s, URL)).map((f) => f.checkId),
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
    expect(checkIdForHtmlValidateRule("deprecated")).toBe(
      "css-for-presentation",
    );
    expect(checkIdForHtmlValidateRule("no-dup-attr")).toBe("markup-nesting");
    expect(checkIdForHtmlValidateRule("element-permitted-content")).toBe(
      "markup-nesting",
    );
    expect(checkIdForHtmlValidateRule("not-a-rule")).toBeUndefined();
  });

  it("keeps the rendered rule set in sync with the map", () => {
    // Adding/removing a rendered rule must be mirrored in the map, or a rule
    // either runs unmapped (invisible) or is claimed without being enabled.
    expect(new Set(HTML_VALIDATE_RENDERED_RULE_IDS)).toEqual(
      new Set(HTML_VALIDATE_TO_CHECK_RULE_IDS),
    );
  });

  it("does not map duplicate-id, landmark, or idref rules", () => {
    expect(checkIdForHtmlValidateRule("no-dup-id")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("no-multiple-main")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("unique-landmark")).toBeUndefined();
    expect(checkIdForHtmlValidateRule("no-missing-references")).toBeUndefined();
  });
});
