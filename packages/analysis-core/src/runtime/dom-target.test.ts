import { describe, expect, it } from "vitest";
import { captureDomTarget } from "./dom-target";

describe("captureDomTarget", () => {
  it("builds a selector from href and accessible name from link text", () => {
    document.body.innerHTML =
      '<nav><a href="/contact" class="btn">Get in touch</a></nav>';
    const link = document.querySelector("a")!;
    const capture = captureDomTarget(link);
    expect(capture.accessibleName).toBe("Get in touch");
    expect(capture.elementLabel).toBe('link “Get in touch”');
    expect(capture.selector).toBe('a[href="/contact"]');
  });

  it("uses aria-label when visible text is empty", () => {
    document.body.innerHTML =
      '<button aria-label="Open menu"><svg /></button>';
    const button = document.querySelector("button")!;
    const capture = captureDomTarget(button);
    expect(capture.elementLabel).toBe('button “Open menu”');
  });

  it("describes an obscuring element at a corner", () => {
    document.body.innerHTML =
      '<header id="top" class="sticky">Nav</header><a href="/a">Link</a>';
    const link = document.querySelector("a")!;
    const header = document.querySelector("header")!;
    const rect = link.getBoundingClientRect();
    header.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 800,
      height: 64,
      top: 0,
      left: 0,
      bottom: 64,
      right: 800,
      toJSON: () => ({}),
    });
    document.elementFromPoint = () => header;

    const capture = captureDomTarget(link, {
      obscuredAt: { x: rect.left + 1, y: rect.top + 1, corner: "top-left" },
    });
    expect(capture.context).toMatch(/Covered by `header#top\.sticky`/);
    expect(capture.context).toMatch(/top-left/);
  });
});
