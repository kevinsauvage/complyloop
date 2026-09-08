import { describe, expect, it } from "vitest";
import {
  HTML_SNIPPET_MAX_LENGTH,
  HTML_SNIPPET_TRUNCATE_LENGTH,
  htmlSnippet,
} from "../dom-location";
import { captureHit, BROWSER_HIT_CAPTURE_SRC, loadHitCapture, LOAD_HIT_CAPTURE_SRC } from "./hit-capture";

describe("htmlSnippet truncation constants", () => {
  it("exports the shared 197/200 limits used across engines", () => {
    expect(HTML_SNIPPET_TRUNCATE_LENGTH).toBe(197);
    expect(HTML_SNIPPET_MAX_LENGTH).toBe(200);
  });

  it("truncates with the shared constant", () => {
    const long = "a".repeat(HTML_SNIPPET_MAX_LENGTH + 1);
    const snippet = htmlSnippet(long);
    expect(snippet).toHaveLength(HTML_SNIPPET_TRUNCATE_LENGTH + 1);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("keeps htmlSnippet.toString() free of imported const bindings", () => {
    const src = htmlSnippet.toString();
    expect(src).not.toMatch(/HTML_SNIPPET_/);
    expect(src).toContain("197");
    expect(src).toContain("200");
  });
});

describe("loadHitCapture", () => {
  it("reconstructs browser captureHit matching the Node helper", () => {
    expect(LOAD_HIT_CAPTURE_SRC).toContain("new Function");
    expect(LOAD_HIT_CAPTURE_SRC).toContain("hitCaptureSrc");

    document.body.innerHTML = '<button id="go">Go</button>';
    const button = document.querySelector("button")!;
    const { captureHit: browserCapture } = loadHitCapture(BROWSER_HIT_CAPTURE_SRC);
    const fromBrowser = browserCapture(button);
    const fromNode = captureHit(button);

    expect(fromBrowser.id).toBe(fromNode.id);
    expect(fromBrowser.selector).toBe(fromNode.selector);
    expect(fromBrowser.html).toBe(fromNode.html);
  });
});

describe("captureHit", () => {
  it("builds a CSS-path selector and accessible name from link text", () => {
    document.body.innerHTML =
      '<nav><a href="/contact" class="btn">Get in touch</a></nav>';
    const link = document.querySelector("a")!;
    const capture = captureHit(link);
    expect(capture.accessibleName).toBe("Get in touch");
    expect(capture.elementLabel).toBe('link “Get in touch”');
    expect(capture.selector).toBe('a[href="/contact"]');
    expect(capture.html).toContain("Get in touch");
    expect(capture.tagName).toBe("A");
  });

  it("uses aria-label when visible text is empty", () => {
    document.body.innerHTML =
      '<button aria-label="Open menu"><svg /></button>';
    const button = document.querySelector("button")!;
    const capture = captureHit(button);
    expect(capture.elementLabel).toBe('button “Open menu”');
    expect(capture.accessibleName).toBe("Open menu");
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

    const capture = captureHit(link, {
      obscuredAt: { x: rect.left + 1, y: rect.top + 1, corner: "top-left" },
    });
    expect(capture.context).toMatch(/Covered by `header#top\.sticky`/);
    expect(capture.context).toMatch(/top-left/);
  });

  it("keeps lightweight selectorRef fields for selectorOf callers", () => {
    document.body.innerHTML = '<button id="go" role="button">Go</button>';
    const button = document.querySelector("button")!;
    const capture = captureHit(button);
    expect(capture.id).toBe("go");
    expect(capture.role).toBe("button");
    expect(capture.selector).toBe("#go");
  });
});
