import { describe, expect, it } from "vitest";

import { isNativeInteractive } from "./a11y-model.ts";
import { type JsxTagNode,parseSource, visitJsxTags } from "./parse.ts";

function firstTag(code: string): JsxTagNode {
  const source = parseSource("test.tsx", `const A = () => (${code});`);
  let found: JsxTagNode | undefined;
  visitJsxTags(source.sourceFile, (node) => {
    found ??= node;
  });
  if (!found) throw new Error(`no JSX tag in ${code}`);
  return found;
}

function isInteractive(code: string): boolean {
  return isNativeInteractive(firstTag(code));
}

describe("isNativeInteractive", () => {
  it("recognizes native widgets", () => {
    expect(isInteractive("<button type='button'>OK</button>")).toBe(true);
    expect(isInteractive("<a href='/x'>link</a>")).toBe(true);
    expect(isInteractive("<input type='text' />")).toBe(true);
    expect(isInteractive("<input list='cities' />")).toBe(true);
    expect(isInteractive("<select />")).toBe(true);
    expect(isInteractive("<select multiple />")).toBe(true);
    expect(isInteractive("<textarea />")).toBe(true);
  });

  it("rejects anchors without href and non-widgets", () => {
    expect(isInteractive("<a>no href</a>")).toBe(false);
    expect(isInteractive("<div>text</div>")).toBe(false);
    expect(isInteractive("<Foo />")).toBe(false);
    expect(isInteractive("<div {...props} />")).toBe(false);
  });

  it("honors size constraints on select", () => {
    expect(isInteractive("<select size={2} />")).toBe(true);
    expect(isInteractive("<select size={1} />")).toBe(true);
  });

  it("maps JSX attribute names and boolean initializers", () => {
    expect(isInteractive("<div tabIndex={0} />")).toBe(false);
    expect(isInteractive("<div contentEditable />")).toBe(false);
    expect(isInteractive("<video autoPlay src='/x.mp4' />")).toBe(true);
    expect(isInteractive("<video src='/x.mp4' />")).toBe(true);
    expect(isInteractive("<audio src='/x.mp3' />")).toBe(true);
    expect(isInteractive("<input disabled={true} />")).toBe(true);
  });
});
