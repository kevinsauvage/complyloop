// @vitest-environment jsdom
/**
 * Contract tests for `resolveIncompleteResults` that need no browser.
 *
 * The browser suite (`incomplete-resolver.test.ts`) exercises the same code
 * against Chromium; it skips wherever the browser is not installed, which left
 * the resolver almost entirely untested in the unit job. These tests drive the
 * public entry point with a page double whose `evaluate` runs the real in-page
 * callbacks against jsdom, so the heuristics (text-box union, visually-hidden
 * skipping, pixel verdict, heading order) are still asserted on real DOM
 * behaviour rather than on canned answers.
 */
import type { Page } from "playwright-core";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AxeViolationLike } from "./findings";
import { resolveIncompleteResults } from "./incomplete-resolver";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxes = new WeakMap<Node, Box>();

/** Gives a node a layout box: jsdom computes none on its own. */
function place(node: Node, box: Box): void {
  boxes.set(node, box);
}

function toRect(box: Box | undefined): DOMRect {
  return new DOMRect(
    box?.x ?? 0,
    box?.y ?? 0,
    box?.width ?? 0,
    box?.height ?? 0,
  );
}

class FakeRange {
  private node: Node | null = null;

  selectNodeContents(node: Node): void {
    this.node = node;
  }

  getBoundingClientRect(): DOMRect {
    return toRect(this.node ? boxes.get(this.node) : undefined);
  }
}

class SettlingTransition {
  finish = vi.fn();
}

interface PageDoubleOptions {
  screenshot?: (clip: Box) => Promise<Buffer>;
  waitForTimeout?: (milliseconds: number) => Promise<void>;
  auxEvaluate?: Page["evaluate"];
}

interface PageDouble extends Page {
  screenshotClips: Box[];
}

/**
 * A `Page` whose `evaluate` really executes the callback. Screenshots are
 * stubbed (the pixels come from `samplePixels`), which is the one thing a
 * headless browser gives us that jsdom cannot.
 */
function pageDouble(options: PageDoubleOptions = {}): PageDouble {
  const aux = {
    setContent: vi.fn(async () => {}),
    evaluate:
      options.auxEvaluate ??
      (async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg)),
    close: vi.fn(async () => {}),
  };
  const context = { newPage: vi.fn(async () => aux) };
  const screenshotClips: Box[] = [];
  const page = {
    // Real `evaluate` is async; `releaseElement` chains `.catch` on it.
    evaluate: async <A, R>(fn: (arg: A) => R, arg: A): Promise<R> => fn(arg),
    screenshot: async ({ clip }: { clip: Box }) => {
      screenshotClips.push(clip);
      return options.screenshot ? options.screenshot(clip) : Buffer.from("png");
    },
    waitForTimeout: options.waitForTimeout ?? (async () => {}),
    context: () => context,
  };
  return Object.assign(page, {
    screenshotClips,
    __aux: aux,
  }) as unknown as PageDouble;
}

/** RGBA pixel list the stubbed canvas returns for the next measurement. */
let pixels: number[] = [];

/** jsdom has no canvas implementation: opt into a null ctx per test. */
let canvasAvailable = true;

/** Opaque white text over a black background: 21:1, a comfortable pass. */
function pixelsAll(color: [number, number, number]): number[] {
  return [color[0], color[1], color[2], 255];
}

function setPixels(colors: Array<[number, number, number]>): void {
  pixels = colors.flatMap(pixelsAll);
}

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return toRect(boxes.get(this));
  };
  document.createRange = () => new FakeRange() as unknown as Range;
  HTMLCanvasElement.prototype.getContext = (() =>
    canvasAvailable
      ? {
          drawImage: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
        }
      : null) as unknown as HTMLCanvasElement["getContext"];
});

beforeEach(() => {
  document.body.innerHTML = "";
  document.getElementById("cl-probe-style")?.remove();
  setPixels([[0, 0, 0]]);
  canvasAvailable = true;
  vi.stubGlobal("createImageBitmap", async () => ({
    width: pixels.length / 4,
    height: 1,
  }));
  vi.stubGlobal("CSSTransition", SettlingTransition);
  Object.defineProperty(document, "getAnimations", {
    configurable: true,
    value: () => [new SettlingTransition()],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A `<p>` with visible text, given a layout box on itself and on its text. */
function paragraph(
  id: string,
  text: string,
  options: {
    color?: string;
    background?: string;
    fontSize?: number;
    fontWeight?: number;
    box?: Box;
  } = {},
): HTMLParagraphElement {
  const element = document.createElement("p");
  element.id = id;
  element.textContent = text;
  element.style.color = options.color ?? "rgb(255, 255, 255)";
  element.style.fontSize = `${options.fontSize ?? 16}px`;
  element.style.fontWeight = String(options.fontWeight ?? 400);
  element.style.background = options.background ?? "rgb(0, 0, 0)";
  document.body.append(element);
  const box = options.box ?? { x: 10, y: 10, width: 200, height: 30 };
  place(element, box);
  const textNode = element.firstChild;
  if (textNode) {
    place(textNode, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  }
  return element;
}

function contrastRule(...selectors: string[]): AxeViolationLike {
  return {
    id: "color-contrast",
    impact: null,
    description: "d",
    help: "h",
    nodes: selectors.map((selector) => ({ html: "<x>", target: [selector] })),
  };
}

function headingRule(...selectors: string[]): AxeViolationLike {
  return {
    id: "heading-order",
    impact: null,
    description: "d",
    help: "h",
    nodes: selectors.map((selector) => ({ html: "<x>", target: [selector] })),
  };
}

describe("resolveIncompleteResults: contrast measurement", () => {
  it("drops a node whose measured contrast clears the ratio", async () => {
    paragraph("ok", "Readable");
    setPixels([[0, 0, 0]]);

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#ok"),
    ]);

    expect(result).toEqual({
      incomplete: [],
      confirmed: [],
      touchedPage: true,
    });
  });

  it("confirms a node whose measured contrast is below the ratio", async () => {
    paragraph("bad", "Pale");
    setPixels([[240, 240, 240]]);

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#bad"),
    ]);

    expect(result.incomplete).toEqual([]);
    expect(result.confirmed[0]?.impact).toBe("serious");
    expect(result.confirmed[0]?.nodes[0]?.failureSummary).toMatch(
      /rendered background/,
    );
  });

  it("keeps a node that fails on part of the background but not most of it", async () => {
    paragraph("mixed", "Mixed");
    // 49% of pixels fail (white on #777 ≈ 4.48:1), the rest are black: the
    // median clears the ratio, the 2nd percentile does not.
    setPixels([
      ...Array.from(
        { length: 49 },
        () => [119, 119, 119] as [number, number, number],
      ),
      ...Array.from(
        { length: 51 },
        () => [0, 0, 0] as [number, number, number],
      ),
    ]);

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#mixed"),
    ]);

    expect(result.confirmed).toEqual([]);
    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("uses the relaxed 3:1 ratio for large bold text only", async () => {
    // #8a8a8a over white is ~3.4:1 — below 4.5, above the 3:1 large-text bar.
    pixels = [255, 255, 255, 255];
    const large = paragraph("big", "Large", {
      fontSize: 40,
      fontWeight: 700,
      color: "rgb(138, 138, 138)",
    });
    const small = paragraph("small", "Small", {
      fontSize: 16,
      color: "rgb(138, 138, 138)",
    });
    expect(large).toBeDefined();
    expect(small).toBeDefined();

    const relaxed = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#big"),
    ]);
    const normal = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#small"),
    ]);

    expect(relaxed.incomplete).toEqual([]);
    expect(relaxed.confirmed).toEqual([]);
    expect(normal.confirmed[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#small",
    ]);
  });

  it("keeps text the page paints with a transparent color", async () => {
    paragraph("ghost", "Gradient", { color: "rgba(0, 0, 0, 0)" });
    const screenshot = vi.fn();

    const result = await resolveIncompleteResults(pageDouble({ screenshot }), [
      contrastRule("#ghost"),
    ]);

    expect(screenshot).not.toHaveBeenCalled();
    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.touchedPage).toBe(true);
  });

  it("keeps text in a color the parser does not understand", async () => {
    paragraph("odd", "Odd");
    const element = document.getElementById("odd");
    // jsdom keeps an unsupported-but-valid CSS Color 4 function verbatim.
    element?.style.setProperty("color", "oklch(0.5 0.1 200)");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#odd"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("keeps a node it cannot find, after one retry", async () => {
    const waitForTimeout = vi.fn(async () => {});
    const result = await resolveIncompleteResults(
      pageDouble({ waitForTimeout }),
      [contrastRule("#later")],
    );

    expect(waitForTimeout).toHaveBeenCalledWith(400);
    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("measures a lazily mounted node on the retry", async () => {
    const waitForTimeout = async () => {
      paragraph("later", "Mounted late");
    };

    const result = await resolveIncompleteResults(
      pageDouble({ waitForTimeout }),
      [contrastRule("#later")],
    );

    expect(result.incomplete).toEqual([]);
    expect(result.confirmed).toEqual([]);
  });

  it("keeps a node behind a selector the DOM rejects", async () => {
    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#broken["),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("keeps a node rendered outside the viewport", async () => {
    paragraph("offscreen", "Away", {
      box: { x: -5000, y: -5000, width: 100, height: 20 },
    });

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#offscreen"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("samples only the visible text, not the clipped text next to it", async () => {
    const element = paragraph("link", "Policy");
    const visuallyHidden = document.createElement("span");
    visuallyHidden.textContent = "(opens in a new tab)";
    visuallyHidden.style.overflow = "hidden";
    element.append(visuallyHidden);

    const textNode = element.firstChild;
    if (textNode) place(textNode, { x: 10, y: 10, width: 60, height: 20 });
    place(visuallyHidden, { x: 0, y: 0, width: 1, height: 1 });
    place(visuallyHidden.firstChild as Node, {
      x: 900,
      y: 900,
      width: 400,
      height: 20,
    });
    place(element, { x: 10, y: 10, width: 500, height: 30 });

    const page = pageDouble();
    await resolveIncompleteResults(page, [contrastRule("#link")]);

    // The clip is the visible glyphs only: 60px wide, not the 900px-wide box
    // the unclipped range of the visually-hidden span reports.
    expect(page.screenshotClips[0]?.width).toBe(60);
  });

  it("falls back to the element box when it holds no text", async () => {
    const element = paragraph("empty", "");
    place(element, { x: 20, y: 20, width: 120, height: 40 });

    const page = pageDouble();
    await resolveIncompleteResults(page, [contrastRule("#empty")]);

    expect(page.screenshotClips[0]).toEqual({
      x: 20,
      y: 20,
      width: 120,
      height: 40,
    });
  });

  it("settles running color transitions and survives one that cannot finish", async () => {
    const settling = new SettlingTransition();
    const idle = new SettlingTransition();
    idle.finish.mockImplementation(() => {
      throw new Error("idle");
    });
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => [settling, idle],
    });
    paragraph("fade", "Fading");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#fade"),
    ]);

    expect(settling.finish).toHaveBeenCalledOnce();
    expect(idle.finish).toHaveBeenCalledOnce();
    expect(result.incomplete).toEqual([]);
  });

  it("hides the text for the screenshot and restores it afterwards", async () => {
    paragraph("probe", "Probe");
    let markedDuringShot = false;

    const page = pageDouble({
      screenshot: async () => {
        markedDuringShot =
          document.getElementById("probe")?.hasAttribute("data-cl-probe") ??
          false;
        return Buffer.from("png");
      },
    });

    await resolveIncompleteResults(page, [contrastRule("#probe")]);

    expect(markedDuringShot).toBe(true);
    expect(document.getElementById("cl-probe-style")).not.toBeNull();
    expect(
      document.getElementById("probe")?.hasAttribute("data-cl-probe"),
    ).toBe(false);
  });

  it("keeps a node when the screenshot fails", async () => {
    paragraph("fragile", "Fragile");
    const page = pageDouble({
      screenshot: async () => {
        throw new Error("detached");
      },
    });

    const result = await resolveIncompleteResults(page, [
      contrastRule("#fragile"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.confirmed).toEqual([]);
    expect(
      document.getElementById("fragile")?.hasAttribute("data-cl-probe"),
    ).toBe(false);
  });

  it("keeps non-document targets untouched", async () => {
    paragraph("frame", "Framed");
    const rule: AxeViolationLike = {
      id: "color-contrast",
      impact: null,
      description: "d",
      help: "h",
      nodes: [{ html: "<x>", target: [["#frame"]] as unknown as string[] }],
    };

    const result = await resolveIncompleteResults(pageDouble(), [rule]);

    expect(result.incomplete[0]?.nodes).toEqual(rule.nodes);
    expect(result.touchedPage).toBe(false);
  });

  it("stops measuring once the node budget is spent", async () => {
    const selectors = Array.from({ length: 62 }, (_, index) => {
      paragraph(`n${index}`, `Text ${index}`);
      return `#n${index}`;
    });

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule(...selectors),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(2);
  });

  it("stops measuring once the time budget is spent", async () => {
    paragraph("first", "First");
    paragraph("second", "Second");
    let clock = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const page = pageDouble({
      screenshot: async () => {
        clock += 30_000;
        return Buffer.from("png");
      },
    });

    const result = await resolveIncompleteResults(page, [
      contrastRule("#first", "#second"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.incomplete[0]?.nodes[0]?.target).toEqual(["#second"]);
  });

  it("keeps the rule and marks the page touched when measurement throws", async () => {
    paragraph("crash", "Crash");
    const page = {
      evaluate: () => {
        throw new Error("navigation");
      },
      context: () => ({
        newPage: async () => ({
          setContent: async () => {},
          evaluate: async () => {},
          close: async () => {},
        }),
      }),
    } as unknown as Page;

    const result = await resolveIncompleteResults(page, [
      contrastRule("#crash"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.touchedPage).toBe(true);
  });

  it("keeps the node when the auxiliary canvas has no 2D context", async () => {
    canvasAvailable = false;
    paragraph("no-canvas", "No canvas");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#no-canvas"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.confirmed).toEqual([]);
  });

  it("keeps the node when the screenshot holds no pixels", async () => {
    setPixels([]);
    paragraph("blank", "Blank");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#blank"),
    ]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
  });

  it("treats a missing font weight as regular text", async () => {
    pixels = [255, 255, 255, 255];
    const element = paragraph("unbold", "Unbold", {
      fontSize: 20,
      color: "rgb(138, 138, 138)",
    });
    element.style.removeProperty("font-weight");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#unbold"),
    ]);

    // 20px is large, but regular weight still owes 4.5:1.
    expect(result.confirmed[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#unbold",
    ]);
  });

  it("grants the relaxed ratio to 19px bold text", async () => {
    pixels = [255, 255, 255, 255];
    paragraph("near-large", "Near large", {
      fontSize: 19,
      fontWeight: 700,
      color: "rgb(138, 138, 138)",
    });

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#near-large"),
    ]);

    expect(result.incomplete).toEqual([]);
    expect(result.confirmed).toEqual([]);
  });

  it("unions the boxes of several visible text runs", async () => {
    const element = document.createElement("p");
    element.id = "runs";
    element.innerHTML = "<span>AB</span> <span>CD</span>";
    element.style.color = "rgb(255, 255, 255)";
    document.body.append(element);
    place(element, { x: 10, y: 10, width: 200, height: 30 });
    const spans = element.querySelectorAll("span");
    const first = spans[0];
    const second = spans[1];
    if (first) place(first, { x: 10, y: 10, width: 20, height: 20 });
    if (second) place(second, { x: 100, y: 10, width: 30, height: 20 });
    const firstText = first?.firstChild;
    const secondText = second?.firstChild;
    if (firstText) place(firstText, { x: 10, y: 10, width: 20, height: 20 });
    if (secondText) place(secondText, { x: 100, y: 10, width: 30, height: 20 });

    const page = pageDouble();
    await resolveIncompleteResults(page, [contrastRule("#runs")]);

    // The whitespace node between the spans contributes nothing; the clip
    // spans both runs (10 → 130).
    expect(page.screenshotClips[0]).toEqual({
      x: 10,
      y: 10,
      width: 120,
      height: 20,
    });
  });

  it("ignores animations that are not color transitions", async () => {
    const finish = vi.fn();
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => [{ finish }],
    });
    paragraph("still", "Still");

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#still"),
    ]);

    expect(finish).not.toHaveBeenCalled();
    expect(result.incomplete).toEqual([]);
  });

  it("survives a page that closes while the probe attribute is released", async () => {
    paragraph("closing", "Closing");
    const page = {
      evaluate: (fn: (arg: unknown) => unknown, arg: unknown) =>
        typeof arg === "string"
          ? Promise.reject(new Error("page closed"))
          : Promise.resolve(fn(arg)),
      screenshot: async () => Buffer.from("png"),
      context: () => ({
        newPage: async () => ({
          setContent: async () => {},
          evaluate: async () => ({ verdict: "pass", worst: 21, median: 21 }),
          close: async () => {
            throw new Error("already gone");
          },
        }),
      }),
    } as unknown as Page;

    const result = await resolveIncompleteResults(page, [
      contrastRule("#closing"),
    ]);

    expect(result.incomplete).toEqual([]);
  });
});

describe("resolveIncompleteResults: heading order", () => {
  it("drops headings that follow the outline and confirms a real skip", async () => {
    document.body.innerHTML =
      '<h1 id="a">T</h1><h2 id="b">S</h2><h4 id="c">Skipped</h4>';

    const result = await resolveIncompleteResults(pageDouble(), [
      headingRule("#a", "#b", "#c"),
    ]);

    expect(result.incomplete).toEqual([]);
    expect(result.confirmed[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#c",
    ]);
    expect(result.confirmed[0]?.impact).toBe("moderate");
    expect(result.confirmed[0]?.nodes[0]?.failureSummary).toMatch(/outline/);
    expect(result.touchedPage).toBe(false);
  });

  it("ignores hidden headings when judging the sequence", async () => {
    document.body.innerHTML =
      '<h1 id="a">T</h1><h4 hidden>Hidden</h4><h2 id="b">S</h2>' +
      '<h3 aria-hidden="true" id="c">Hidden too</h3>';

    const result = await resolveIncompleteResults(pageDouble(), [
      headingRule("#a", "#b"),
    ]);

    expect(result.incomplete).toEqual([]);
    expect(result.confirmed).toEqual([]);
  });

  it("honours role=heading with aria-level", async () => {
    document.body.innerHTML =
      '<div role="heading" aria-level="1" id="a">T</div>' +
      '<div role="heading" aria-level="4" id="b">Deep</div>';

    const result = await resolveIncompleteResults(pageDouble(), [
      headingRule("#a", "#b"),
    ]);

    expect(result.confirmed[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#b",
    ]);
  });

  it("keeps nodes whose selector is invalid or no longer resolves", async () => {
    document.body.innerHTML = '<h1 id="a">T</h1>';

    const result = await resolveIncompleteResults(pageDouble(), [
      headingRule("#a", "#gone[", "#removed"),
    ]);

    expect(result.incomplete[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#gone[",
      "#removed",
    ]);
    expect(result.confirmed).toEqual([]);
  });

  it("ignores non-HTML role=heading elements and defaults their level", async () => {
    document.body.innerHTML =
      '<svg role="heading" id="icon"></svg>' +
      '<div role="heading" id="plain">Plain</div>';

    const result = await resolveIncompleteResults(pageDouble(), [
      headingRule("#icon", "#plain"),
    ]);

    // The SVG is not a heading in the outline; the role-only div counts as
    // level 2 after the missing h1, so neither is a skip.
    expect(result.incomplete).toEqual([]);
    expect(result.confirmed).toEqual([]);
  });

  it("keeps a node whose target is not a document selector", async () => {
    document.body.innerHTML = '<h1 id="a">T</h1>';
    const rule: AxeViolationLike = {
      id: "heading-order",
      impact: null,
      description: "d",
      help: "h",
      nodes: [{ html: "<x>", target: [["#a"]] as unknown as string[] }],
    };

    const result = await resolveIncompleteResults(pageDouble(), [rule]);

    expect(result.incomplete[0]?.nodes).toEqual(rule.nodes);
  });

  it("keeps the rule when the heading pass throws", async () => {
    const page = {
      evaluate: () => {
        throw new Error("detached");
      },
    } as unknown as Page;

    const result = await resolveIncompleteResults(page, [headingRule("#a")]);

    expect(result.incomplete[0]?.nodes).toHaveLength(1);
    expect(result.touchedPage).toBe(false);
  });
});

describe("resolveIncompleteResults: rule routing", () => {
  it("passes rules it does not resolve through untouched", async () => {
    const rule = headingRule("#x");
    rule.id = "aria-valid-attr-value";

    const result = await resolveIncompleteResults({} as never, [rule]);

    expect(result).toEqual({
      incomplete: [rule],
      confirmed: [],
      touchedPage: false,
    });
  });

  it("reports both kept and confirmed nodes for one rule", async () => {
    paragraph("good", "Good");
    paragraph("gone", "Gone", {
      box: { x: -5000, y: -5000, width: 100, height: 20 },
    });

    const result = await resolveIncompleteResults(pageDouble(), [
      contrastRule("#good", "#gone"),
    ]);

    expect(result.incomplete[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#gone",
    ]);
    expect(result.confirmed).toEqual([]);
  });

  it("logs the reason when the debug flag is on", async () => {
    vi.stubEnv("COMPLYLOOP_DEBUG_RESOLVER", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    paragraph("debug", "Debug");

    await resolveIncompleteResults(pageDouble(), [contrastRule("#debug")]);

    expect(
      info.mock.calls.some(([line]) => String(line).includes("pass")),
    ).toBe(true);
  });

  it("explains every unmeasured node when debugging", async () => {
    vi.stubEnv("COMPLYLOOP_DEBUG_RESOLVER", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    paragraph("transparent", "Faded", { color: "rgba(0, 0, 0, 0)" });
    paragraph("unparsed", "Odd");
    document
      .getElementById("unparsed")
      ?.style.setProperty("color", "oklch(50% 0 0)");
    const nested: AxeViolationLike = {
      id: "color-contrast",
      impact: null,
      description: "d",
      help: "h",
      nodes: [
        { html: "<x>", target: [["#transparent"]] as unknown as string[] },
      ],
    };

    await resolveIncompleteResults(pageDouble(), [
      contrastRule("#missing", "#transparent", "#unparsed"),
      nested,
    ]);

    const lines = info.mock.calls.map(([line]) => String(line));
    expect(
      lines.some((line) => line.includes("not measurable (not-found)")),
    ).toBe(true);
    expect(lines.some((line) => line.includes("manual review"))).toBe(true);
    expect(
      lines.some((line) => line.includes("not measurable (unparsed color)")),
    ).toBe(true);
    expect(lines.some((line) => line.includes("non-document target"))).toBe(
      true,
    );
  });

  it("logs a failed measurement when debugging", async () => {
    vi.stubEnv("COMPLYLOOP_DEBUG_RESOLVER", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    paragraph("boom", "Boom");
    const page = {
      evaluate: async () => ({}),
      context: () => {
        throw new Error("browser closed");
      },
    } as unknown as Page;

    await resolveIncompleteResults(page, [contrastRule("#boom")]);

    expect(
      info.mock.calls.some(([line]) =>
        String(line).includes("color-contrast failed"),
      ),
    ).toBe(true);
  });
});
