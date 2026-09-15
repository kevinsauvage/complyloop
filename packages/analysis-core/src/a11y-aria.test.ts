import { describe, expect, it } from "vitest";

import {
  explicitRoles,
  isAriaProperty,
  isConcreteAriaRole,
  isDomHost,
  nativeSatisfiesRole,
  requiredAriaProps,
} from "./a11y-aria";
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

  it("accepts concrete roles and rejects abstract ones", () => {
    expect(isConcreteAriaRole("button")).toBe(true);
    expect(isConcreteAriaRole("checkbox")).toBe(true);
    expect(isConcreteAriaRole("widget")).toBe(false);
    expect(isConcreteAriaRole("buton")).toBe(false);
  });

  it("recognizes ARIA properties from aria-query", () => {
    expect(isAriaProperty("aria-label")).toBe(true);
    expect(isAriaProperty("aria-checked")).toBe(true);
    expect(isAriaProperty("aria-lable")).toBe(false);
  });

  it("lists required props for checkbox and combobox", () => {
    expect(requiredAriaProps("checkbox").map((prop) => prop.name)).toEqual([
      "aria-checked",
    ]);
    expect(requiredAriaProps("combobox").map((prop) => prop.name)).toEqual([
      "aria-controls",
      "aria-expanded",
    ]);
  });

  it("reads space-separated explicit roles", () => {
    expect(
      explicitRoles(firstTag(`const A = () => <div role="button">x</div>;`)),
    ).toEqual(["button"]);
  });

  it("treats native heading and checkbox as satisfying their roles", () => {
    expect(
      nativeSatisfiesRole(
        firstTag(`const A = () => <h2 role="heading">x</h2>;`),
        "heading",
      ),
    ).toBe(true);
    expect(
      nativeSatisfiesRole(
        firstTag(`const A = () => <input type="checkbox" role="checkbox" />;`),
        "checkbox",
      ),
    ).toBe(true);
    expect(
      nativeSatisfiesRole(
        firstTag(`const A = () => <div role="checkbox">x</div>;`),
        "checkbox",
      ),
    ).toBe(false);
  });
});
