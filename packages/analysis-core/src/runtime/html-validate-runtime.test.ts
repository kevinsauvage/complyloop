import { describe, expect, it } from "vitest";
import { htmlValidateFindingsFromSerialized } from "./html-validate-runtime";
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

  it("reports duplicate ids under no-dup-id → duplicate-id", () => {
    const s = serialized(
      `<html><body><span id="d"></span><span id="d"></span></body></html>`,
    );
    const f = htmlValidateFindingsFromSerialized(s, URL);
    expect(f.some((x) => x.checkId === "duplicate-id")).toBe(true);
    expect(f.some((x) => x.engine === "runtime")).toBe(true);
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
    expect(checkIdForHtmlValidateRule("not-a-rule")).toBeUndefined();
  });
});