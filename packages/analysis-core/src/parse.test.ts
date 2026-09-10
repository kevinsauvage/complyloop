import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  attributeRemovalSpan,
  booleanAttributeValue,
  getAttribute,
  hasTextContent,
  humanizeFileName,
  jsxElementOf,
  locationOf,
  parseSource,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "./parse";

function firstTag(source: string): {
  tag: JsxTagNode;
  parsed: ReturnType<typeof parseSource>;
} {
  const parsed = parseSource("test.tsx", source);
  let tag: JsxTagNode | undefined;
  visitJsxTags(parsed.sourceFile, (node) => {
    if (!tag) tag = node;
  });
  if (!tag) throw new Error("expected a JSX tag");
  return { tag, parsed };
}

describe("parseSource helpers", () => {
  it("reads tag names and string attribute values", () => {
    const { tag } = firstTag(`const A = () => <img alt="Hero" src={src} />;`);
    expect(tagNameOf(tag)).toBe("img");
    expect(stringValueOf(getAttribute(tag, "alt")!)).toBe("Hero");
    expect(stringValueOf(getAttribute(tag, "src")!)).toBeUndefined();
    expect(getAttribute(tag, "missing")).toBeUndefined();
  });

  it("reads boolean attributes when statically known", () => {
    const hidden = firstTag(`const A = () => <div aria-hidden />;`);
    expect(booleanAttributeValue(getAttribute(hidden.tag, "aria-hidden"))).toBe(
      true,
    );
    expect(booleanAttributeValue(undefined)).toBe(false);

    const falseLit = firstTag(`const A = () => <div aria-hidden="false" />;`);
    expect(
      booleanAttributeValue(getAttribute(falseLit.tag, "aria-hidden")),
    ).toBe(false);

    const trueExpr = firstTag(`const A = () => <div aria-hidden={true} />;`);
    expect(
      booleanAttributeValue(getAttribute(trueExpr.tag, "aria-hidden")),
    ).toBe(true);

    const falseExpr = firstTag(`const A = () => <div aria-hidden={false} />;`);
    expect(
      booleanAttributeValue(getAttribute(falseExpr.tag, "aria-hidden")),
    ).toBe(false);

    const dynamic = firstTag(`const A = () => <div aria-hidden={flag} />;`);
    expect(booleanAttributeValue(getAttribute(dynamic.tag, "aria-hidden"))).toBe(
      null,
    );
  });

  it("extends attribute removal spans through leading whitespace", () => {
    const { tag, parsed } = firstTag(
      `const A = () => <img   alt="x" src="/a.png" />;`,
    );
    const alt = getAttribute(tag, "alt");
    if (!alt) throw new Error("expected alt");
    const span = attributeRemovalSpan(alt, parsed.sourceFile, parsed.text);
    expect(parsed.text.slice(span.start, span.end)).toMatch(/^\s+alt="x"$/);
  });

  it("builds a source location from a node", () => {
    const { tag, parsed } = firstTag(`const A = () => <button>Save</button>;`);
    const location = locationOf(parsed, tag);
    expect(location.kind).toBe("source");
    expect(location.filePath).toBe("test.tsx");
    expect(location.line).toBe(1);
    expect(location.snippet).toContain("<button>");
  });

  it("keeps attributes when a tag spans multiple lines", () => {
    const { tag, parsed } = firstTag(
      [
        `const A = () => (`,
        `  <a`,
        `    href="https://example.com"`,
        `    target="_blank"`,
        `  >`,
        `    Site`,
        `  </a>`,
        `);`,
      ].join("\n"),
    );

    const location = locationOf(parsed, tag);

    expect(location.line).toBe(2);
    expect(location.snippet).toContain("<a");
    expect(location.snippet).toContain('href="https://example.com"');
    expect(location.snippet).toContain('target="_blank"');
  });

  it("returns the wrapping element for opening tags only", () => {
    const opening = firstTag(`const A = () => <button>Save</button>;`);
    expect(jsxElementOf(opening.tag)).toBeDefined();
    expect(ts.isJsxElement(jsxElementOf(opening.tag)!)).toBe(true);

    const selfClosing = firstTag(`const A = () => <img alt="x" />;`);
    expect(jsxElementOf(selfClosing.tag)).toBeUndefined();
  });

  it("detects accessible text content including named images", () => {
    const withText = firstTag(`const A = () => <button>Save</button>;`);
    expect(hasTextContent(jsxElementOf(withText.tag)!)).toBe(true);

    const withExpr = firstTag(`const A = () => <button>{label}</button>;`);
    expect(hasTextContent(jsxElementOf(withExpr.tag)!)).toBe(true);

    const withImg = firstTag(
      `const A = () => <a href="/"><img alt="Home" /></a>;`,
    );
    expect(hasTextContent(jsxElementOf(withImg.tag)!)).toBe(true);

    const withImage = firstTag(
      `const A = () => <a href="/"><Image alt="Home" /></a>;`,
    );
    expect(hasTextContent(jsxElementOf(withImage.tag)!)).toBe(true);

    const empty = firstTag(`const A = () => <button><svg /></button>;`);
    expect(hasTextContent(jsxElementOf(empty.tag)!)).toBe(false);
  });

  it("humanizes file names for suggested alt text", () => {
    expect(humanizeFileName("hero-banner.png")).toBe("Hero banner");
    expect(humanizeFileName("/assets/user_avatar.webp")).toBe("User avatar");
    expect(humanizeFileName(".png")).toBe("");
  });
});
