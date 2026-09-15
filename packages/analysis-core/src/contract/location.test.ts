import { describe, expect, it } from "vitest";

import type {
  DomLocation,
  SiteLocation,
  SourceLocation,
} from "@complyloop/analysis-core/contract/finding-types";

import {
  domLocationDetails,
  formatLocationRef,
  isDomLocation,
  isSiteLocation,
  isSourceLocation,
  locationPathOrUrl,
  locationSnippet,
} from "./location";

describe("location kind guards", () => {
  it("narrows source, dom, and site locations", () => {
    const source: SourceLocation = {
      kind: "source",
      filePath: "a.tsx",
      line: 1,
      column: 1,
      snippet: "<x/>",
      span: { start: 0, end: 1 },
    };
    expect(isSourceLocation(source)).toBe(true);
    expect(isDomLocation(source)).toBe(false);
    expect(isSiteLocation(source)).toBe(false);

    const dom: DomLocation = {
      kind: "dom",
      url: "https://e.com/",
      selector: "a",
      snippet: "<a/>",
    };
    expect(isDomLocation(dom)).toBe(true);

    const site: SiteLocation = { kind: "site", pages: ["/a"], detail: "d" };
    expect(isSiteLocation(site)).toBe(true);
  });
});

describe("formatLocationRef", () => {
  it("prefers element label for dom findings", () => {
    expect(
      formatLocationRef({
        kind: "dom",
        url: "https://www.kevin-sauvage.com/a",
        selector: "a",
        snippet: "<a href='/contact'>Contact</a>",
        elementLabel: "link “Contact”",
      }),
    ).toBe("/a › link “Contact”");
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
        elementLabel: "link “Contact”",
        context: "Covered by `header.sticky` at the top-left of the focus ring",
      }),
    ).toEqual([
      { term: "Element", value: "link “Contact”" },
      { term: "Page", value: "https://example.com/" },
      { term: "Selector", value: 'a[href="/contact"]' },
      {
        term: "Context",
        value: "Covered by `header.sticky` at the top-left of the focus ring",
      },
    ]);
  });
});

describe("locationSnippet", () => {
  it("uses the detail text for site findings and the snippet otherwise", () => {
    expect(
      locationSnippet({ kind: "site", pages: ["/a"], detail: "Ping" }),
    ).toBe("Ping");
    expect(
      locationSnippet({
        kind: "source",
        filePath: "a.tsx",
        line: 1,
        column: 1,
        snippet: "<x/>",
        span: { start: 0, end: 1 },
      }),
    ).toBe("<x/>");
  });
});

describe("locationPathOrUrl", () => {
  it("returns filePath, url, or joined pages", () => {
    expect(
      locationPathOrUrl({
        kind: "source",
        filePath: "a.tsx",
        line: 1,
        column: 1,
        snippet: "",
        span: { start: 0, end: 1 },
      }),
    ).toBe("a.tsx");
    expect(
      locationPathOrUrl({
        kind: "dom",
        url: "https://e.com/",
        selector: "a",
        snippet: "",
      }),
    ).toBe("https://e.com/");
    expect(
      locationPathOrUrl({ kind: "site", pages: ["/a", "/b"], detail: "" }),
    ).toBe("/a, /b");
  });
});

describe("formatLocationRef site findings", () => {
  it("joins up to two pages and collapses more", () => {
    expect(
      formatLocationRef({ kind: "site", pages: ["/a", "/b"], detail: "Ping" }),
    ).toBe("Site: /a, /b — Ping");
    expect(
      formatLocationRef({
        kind: "site",
        pages: ["/a", "/b", "/c"],
        detail: "Ping",
      }),
    ).toBe("Site: 3 pages — Ping");
  });
});

describe("formatLocationRef dom fallbacks", () => {
  it("falls back to url › selector when there is no element label", () => {
    expect(
      formatLocationRef({
        kind: "dom",
        url: "https://e.com/",
        selector: "#x",
        snippet: "",
      }),
    ).toBe("https://e.com/ › #x");
  });

  it("falls back to the raw url when the url is not parseable", () => {
    expect(
      formatLocationRef({
        kind: "dom",
        url: "not a url",
        selector: "#x",
        snippet: "",
        elementLabel: "el",
      }),
    ).toBe("not a url › el");
  });
});
