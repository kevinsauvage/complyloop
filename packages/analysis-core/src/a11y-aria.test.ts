import { describe, expect, it } from "vitest";

import { explicitRoles, isDomHost } from "./a11y-aria";
import { type JsxTagNode, parseSource, visitJsxTags } from "./parse";

function firstTag(jsx: string): JsxTagNode {
  const parsed = parseSource("test.tsx", jsx);
  let found: JsxTagNode | undefined;
  visitJsxTags(parsed.sourceFile, (node) => {
    if (!found) found = node;
  });
  if (!found) throw new Error("expected a JSX tag");
  return found;
}

describe("a11y-aria", () => {
  it("treats lowercase HTML tags as DOM hosts and components as not", () => {
    expect(isDomHost("div")).toBe(true);
    expect(isDomHost("button")).toBe(true);
    expect(isDomHost("Button")).toBe(false);
  });

  it("reads space-separated explicit roles", () => {
    expect(
      explicitRoles(firstTag(`const A = () => <div role="button">x</div>;`)),
    ).toEqual(["button"]);
  });
});
