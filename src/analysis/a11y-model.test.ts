import { describe, expect, it } from "vitest";
import { isFocusable } from "./a11y-model";
import { parseSource, visitJsxTags, type JsxTagNode } from "./parse";

function firstTag(jsx: string): JsxTagNode {
  const parsed = parseSource("test.tsx", jsx);
  let found: JsxTagNode | undefined;
  visitJsxTags(parsed.sourceFile, (node) => {
    if (!found) found = node;
  });
  if (!found) throw new Error("expected a JSX tag");
  return found;
}

describe("isFocusable", () => {
  it("treats native widgets as focusable", () => {
    expect(isFocusable(firstTag(`const A = () => <button>x</button>;`))).toBe(
      true,
    );
    expect(
      isFocusable(firstTag(`const A = () => <a href="/x">x</a>;`)),
    ).toBe(true);
    expect(isFocusable(firstTag(`const A = () => <input />;`))).toBe(true);
    expect(isFocusable(firstTag(`const A = () => <select />;`))).toBe(true);
    expect(isFocusable(firstTag(`const A = () => <textarea />;`))).toBe(true);
    expect(isFocusable(firstTag(`const A = () => <summary>x</summary>;`))).toBe(
      true,
    );
  });

  it("does not treat a link without href as focusable", () => {
    expect(isFocusable(firstTag(`const A = () => <a>x</a>;`))).toBe(false);
  });

  it("does not treat disabled widgets as focusable", () => {
    expect(
      isFocusable(firstTag(`const A = () => <button disabled>x</button>;`)),
    ).toBe(false);
    expect(
      isFocusable(
        firstTag(`const A = () => <input aria-disabled="true" />;`),
      ),
    ).toBe(false);
  });

  it("treats explicit widget roles and contentEditable as focusable", () => {
    expect(
      isFocusable(
        firstTag(`const A = () => <div role="button">x</div>;`),
      ),
    ).toBe(true);
    expect(
      isFocusable(firstTag(`const A = () => <div contentEditable>x</div>;`)),
    ).toBe(true);
  });

  it("treats media widgets and tabindex >= 0 as focusable", () => {
    expect(isFocusable(firstTag(`const A = () => <video />;`))).toBe(true);
    expect(isFocusable(firstTag(`const A = () => <audio />;`))).toBe(true);
    expect(
      isFocusable(firstTag(`const A = () => <div tabIndex={0}>x</div>;`)),
    ).toBe(true);
    expect(
      isFocusable(firstTag(`const A = () => <div tabIndex={-1}>x</div>;`)),
    ).toBe(false);
  });

  it("does not treat generic elements as focusable", () => {
    expect(isFocusable(firstTag(`const A = () => <div>x</div>;`))).toBe(false);
    expect(isFocusable(firstTag(`const A = () => <span>x</span>;`))).toBe(
      false,
    );
  });
});
