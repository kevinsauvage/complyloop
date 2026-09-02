import { describe, expect, it } from "vitest";
import { domLocationDetails, formatLocationRef } from "./location";

describe("formatLocationRef", () => {
  it("prefers element label for dom findings", () => {
    expect(
      formatLocationRef({
        kind: "dom",
        url: "https://www.kevin-sauvage.com/a",
        selector: "a",
        snippet: "<a href='/contact'>Contact</a>",
        elementLabel: 'link “Contact”',
      }),
    ).toBe('/a › link “Contact”');
  });
});

describe("domLocationDetails", () => {
  it("lists element, page, selector, and context", () => {
    expect(
      domLocationDetails({
        kind: "dom",
        url: "https://example.com/",
        selector: 'a[href="/contact"]',
        snippet: "<a>Contact</a>",
        elementLabel: 'link “Contact”',
        context: "Covered by `header.sticky` at the top-left of the focus ring",
      }),
    ).toEqual([
      { term: "Element", value: 'link “Contact”' },
      { term: "Page", value: "https://example.com/" },
      { term: "Selector", value: 'a[href="/contact"]' },
      {
        term: "Context",
        value: "Covered by `header.sticky` at the top-left of the focus ring",
      },
    ]);
  });
});
