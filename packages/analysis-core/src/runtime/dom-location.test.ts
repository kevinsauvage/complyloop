import { describe, expect, it } from "vitest";

import {
  describeAxeElement,
  namingAttributeOf,
  visibleTextOf,
} from "./dom-location";

describe("visibleTextOf", () => {
  it("extracts inner text from complete markup", () => {
    expect(visibleTextOf("<h2>Build accessible experiences</h2>")).toBe(
      "Build accessible experiences",
    );
  });

  it("returns empty for snippets truncated mid-tag (class soup)", () => {
    expect(
      visibleTextOf(
        '<h2 class="animate-gradient bg-[length:200%_auto] text-4xl md:text-5xl lg:text-6xl text-3xl md:text-5xl leading-snug font-bold font-heading bg-gradient-to-r from-primary-400 via-secondary-500 to-ac…',
      ),
    ).toBe("");
  });

  it("returns empty for icon-only markup without text", () => {
    expect(
      visibleTextOf(
        '<a aria-label="Go to Home section" class="fixed bottom-6"><svg class="size-5"></svg></a>',
      ),
    ).toBe("");
  });
});

describe("namingAttributeOf", () => {
  it("reads aria-label and alt names", () => {
    expect(
      namingAttributeOf('<a aria-label="Go to Home section" class="x">'),
    ).toBe("Go to Home section");
    expect(namingAttributeOf('<img src="/hero.png" alt="Team photo">')).toBe(
      "Team photo",
    );
  });

  it("returns empty when no naming attribute is present", () => {
    expect(namingAttributeOf('<h2 class="text-4xl">')).toBe("");
  });

  it("reads attributes from snippets truncated mid-tag", () => {
    expect(
      namingAttributeOf(
        '<a aria-label="Go to Home section" class="fixed bottom-6 flex items-center gap-2 to-ac…',
      ),
    ).toBe("Go to Home section");
  });
});

describe("describeAxeElement", () => {
  it("prefers visible text, then naming attributes, then tag + selector", () => {
    expect(
      describeAxeElement("<h2>Build accessible experiences</h2>", ".hero > h2"),
    ).toBe("h2 \u201cBuild accessible experiences\u201d");
    expect(
      describeAxeElement(
        '<a aria-label="Go to Home section" class="x"><svg></svg></a>',
        'a[aria-label="Go to Home section"]',
      ),
    ).toBe("a \u201cGo to Home section\u201d");
    expect(
      describeAxeElement("<input type=\"email\">", "input[type=email]"),
    ).toBe("input (input[type=email])");
  });
});
