import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  hasAnyAttr,
  jsxElementOf,
  type JsxTagNode,
  parseSource,
  tagNameOf,
  visitJsxElements,
  visitJsxTags,
} from "../parse";
import {
  ariaDescribedByPointsToTranscript,
  attributeContextOf,
  classNameTextOf,
  descendantTags,
  hasAdjacentTagMatching,
  hasAdjacentTranscriptLink,
  hasChildTrackKind,
  isComplexDataTable,
  isDataTable,
  isInsideNamingHost,
  nextMeaningfulSibling,
  styleLocksTextSpacing,
  tagNodeOfJsxChild,
  textContentOf,
  walkMotionActuationCalls,
} from "./heuristic-utils";

function firstTag(source: string): JsxTagNode {
  const parsed = parseSource("test.tsx", source);
  let tag: JsxTagNode | undefined;
  visitJsxTags(parsed.sourceFile, (node) => {
    if (!tag) tag = node;
  });
  if (!tag) throw new Error("expected a JSX tag");
  return tag;
}

describe("heuristic-utils", () => {
  it("detects attributes and class names", () => {
    const tagged = firstTag(
      `const A = () => <div className="card" style={{ backgroundImage: "url(x)" }} data-ok />`,
    );
    expect(hasAnyAttr(tagged, ["data-ok"])).toBe(true);
    expect(hasAnyAttr(tagged, ["missing"])).toBe(false);
    expect(classNameTextOf(tagged)).toBe("card");

    const classAttr = firstTag(`const A = () => <div class="plain" />;`);
    expect(classNameTextOf(classAttr)).toBe("plain");
    expect(classNameTextOf(firstTag(`const A = () => <div />;`))).toBe("");
  });

  it("detects motion listeners", () => {
    const motion = parseSource(
      "test.tsx",
      `window.addEventListener("devicemotion", handler);`,
    );
    const nodes: unknown[] = [];
    walkMotionActuationCalls(motion.sourceFile, (node) => nodes.push(node));
    expect(nodes).toHaveLength(1);

    const other = parseSource(
      "test.tsx",
      `window.addEventListener("click", handler);`,
    );
    walkMotionActuationCalls(other.sourceFile, () => {
      throw new Error("should not emit");
    });
  });

  it("finds media tracks and !important text-spacing locks", () => {
    expect(
      hasChildTrackKind(
        firstTag(
          `const A = () => (<video><track kind="captions" src="/c.vtt" /></video>);`,
        ),
        new Set(["captions"]),
      ),
    ).toBe(true);
    expect(
      hasChildTrackKind(
        firstTag(`const A = () => <video src="/v.mp4" />;`),
        new Set(["captions"]),
      ),
    ).toBe(false);

    expect(
      styleLocksTextSpacing(
        firstTag(`const A = () => <p style={{ lineHeight: "1.2 !important" }} />;`),
      ),
    ).toBe(true);
    expect(
      styleLocksTextSpacing(
        firstTag(`const A = () => <p style={{ lineHeight: "1.5" }} />;`),
      ),
    ).toBe(false);
  });

  it("walks descendant tags and text, and flags complex tables", () => {
    const parsed = parseSource(
      "test.tsx",
      `const A = () => (
        <table>
          <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
            <tr><td>5</td><td>6</td><td>7</td><td>8</td></tr>
            <tr><td>9</td><td>10</td><td>11</td><td>12</td></tr>
            <tr><td>13</td><td>14</td><td>15</td><td>16</td></tr>
          </tbody>
        </table>
      );`,
    );
    let table: JsxTagNode | undefined;
    visitJsxTags(parsed.sourceFile, (node) => {
      if (!table) table = node;
    });
    if (!table) throw new Error("expected table");
    expect(isComplexDataTable(table)).toBe(true);

    const simple = firstTag(
      `const A = () => <table><tr><th>Name</th><td>Ada</td></tr></table>;`,
    );
    expect(isComplexDataTable(simple)).toBe(false);

    const headers = firstTag(
      `const A = () => <table><td headers="h1">x</td></table>;`,
    );
    expect(isComplexDataTable(headers)).toBe(true);

    const spanned = firstTag(
      `const A = () => <table><td colSpan="2">x</td></table>;`,
    );
    expect(isComplexDataTable(spanned)).toBe(true);

    const elements: string[] = [];
    visitJsxElements(parsed.sourceFile, (element) => {
      elements.push(textContentOf(element).trim());
    });
    expect(elements.some((text) => text.includes("A"))).toBe(true);
    expect(descendantTags(elementFor(parsed, "table")).length).toBeGreaterThan(1);
  });

  it("detects naming hosts and adjacent transcripts", () => {
    const named = parseSource(
      "test.tsx",
      `const A = () => <button><img alt="" /></button>;`,
    );
    let img: JsxTagNode | undefined;
    visitJsxTags(named.sourceFile, (node) => {
      if (node.tagName.getText() === "img") img = node;
    });
    if (!img) throw new Error("expected img");
    expect(isInsideNamingHost(img)).toBe(true);
    expect(isInsideNamingHost(firstTag(`const A = () => <img alt="" />;`))).toBe(
      false,
    );

    const adjacentSource = parseSource(
      "test.tsx",
      `const A = () => (<div><video /><a href="/talk-transcript">Transcript</a></div>);`,
    );
    let video: JsxTagNode | undefined;
    visitJsxTags(adjacentSource.sourceFile, (node) => {
      if (node.tagName.getText() === "video") video = node;
    });
    if (!video) throw new Error("expected video");
    expect(hasAdjacentTranscriptLink(video)).toBe(true);

    const described = parseSource(
      "test.tsx",
      `const A = () => (<div><video aria-describedby="tx" /><p id="tx">Full transcript here</p></div>);`,
    );
    let describedVideo: JsxTagNode | undefined;
    visitJsxTags(described.sourceFile, (node) => {
      if (node.tagName.getText() === "video") describedVideo = node;
    });
    if (!describedVideo) throw new Error("expected video");
    expect(
      ariaDescribedByPointsToTranscript(describedVideo, described.sourceFile),
    ).toBe(true);
  });

  it("resolves adjacent siblings across fragments, whitespace, and self-closing tags", () => {
    const fragmentSource = parseSource(
      "test.tsx",
      `const A = () => (<><canvas />
        <a href="/alt">Text alternative</a></>);`,
    );
    let canvas: JsxTagNode | undefined;
    visitJsxTags(fragmentSource.sourceFile, (node) => {
      if (node.tagName.getText() === "canvas") canvas = node;
    });
    if (!canvas) throw new Error("expected canvas");

    const next = nextMeaningfulSibling(canvas);
    expect(next).toBeDefined();
    expect(tagNameOf(next!.tag)).toBe("a");
    expect(next!.element).toBeDefined();
    expect(
      hasAdjacentTagMatching(canvas, (tag) => tagNameOf(tag) === "a"),
    ).toBe(true);

    const whitespaceSource = parseSource(
      "test.tsx",
      `const A = () => (<div><object data="/x" />
        <button aria-label="Open description" /></div>);`,
    );
    let objectTag: JsxTagNode | undefined;
    visitJsxTags(whitespaceSource.sourceFile, (node) => {
      if (node.tagName.getText() === "object") objectTag = node;
    });
    if (!objectTag) throw new Error("expected object");
    const selfClosingNext = nextMeaningfulSibling(objectTag);
    expect(selfClosingNext).toBeDefined();
    expect(tagNameOf(selfClosingNext!.tag)).toBe("button");
    expect(selfClosingNext!.element).toBeUndefined();

    const loneChildSource = parseSource(
      "test.tsx",
      `const A = () => <div><img /></div>;`,
    );
    let loneImg: JsxTagNode | undefined;
    visitJsxTags(loneChildSource.sourceFile, (node) => {
      if (node.tagName.getText() === "img") loneImg = node;
    });
    if (!loneImg) throw new Error("expected img");
    expect(nextMeaningfulSibling(loneImg)).toBeUndefined();
    expect(hasAdjacentTagMatching(loneImg, () => true)).toBe(false);

    const expressionSibling = parseSource(
      "test.tsx",
      `const A = () => (<div><embed />{alt}</div>);`,
    );
    let embed: JsxTagNode | undefined;
    visitJsxTags(expressionSibling.sourceFile, (node) => {
      if (node.tagName.getText() === "embed") embed = node;
    });
    if (!embed) throw new Error("expected embed");
    expect(nextMeaningfulSibling(embed)).toBeUndefined();

    const video = firstTag(
      `const A = () => (<video><track kind="captions" src="/c.vtt" /></video>);`,
    );
    const element = jsxElementOf(video);
    if (!element) throw new Error("expected video element");
    const trackChild = element.children.find((child) => tagNodeOfJsxChild(child));
    expect(trackChild).toBeDefined();
    expect(tagNameOf(tagNodeOfJsxChild(trackChild!)!)).toBe("track");
    expect(tagNodeOfJsxChild(ts.factory.createJsxText("   "))).toBeUndefined();
  });

  it("assembles attribute context from tag, class, and id", () => {
    expect(
      attributeContextOf(
        firstTag(`const A = () => <div className="g-recaptcha" id="bot-check" />;`),
      ),
    ).toBe("div g-recaptcha bot-check");
    expect(attributeContextOf(firstTag(`const A = () => <span class="plain" />;`))).toBe(
      "span plain ",
    );
    expect(attributeContextOf(firstTag(`const A = () => <ReCAPTCHA />;`))).toBe(
      "ReCAPTCHA  ",
    );
  });

  it("returns false for video with non-matching track kind", () => {
    const metadata = firstTag(
      `const A = () => (<video><track kind="metadata" src="/m.vtt" /></video>);`,
    );
    expect(hasChildTrackKind(metadata, new Set(["captions", "subtitles"]))).toBe(
      false,
    );

    const noKind = firstTag(
      `const A = () => (<video><track src="/m.vtt" /></video>);`,
    );
    expect(hasChildTrackKind(noKind, new Set(["captions"]))).toBe(false);
  });

  it("handles non-object, spread, and non-spacing styles", () => {
    expect(
      styleLocksTextSpacing(
        firstTag(`const A = () => <p style="line-height: 1.5" />;`),
      ),
    ).toBe(false);
    expect(
      styleLocksTextSpacing(firstTag(`const A = () => <p style={myStyle} />;`)),
    ).toBe(false);
    expect(
      styleLocksTextSpacing(
        firstTag(`const A = () => <p style={{ ...base }} />;`),
      ),
    ).toBe(false);
    expect(
      styleLocksTextSpacing(
        firstTag(`const A = () => <p style={{ color: "red" }} />;`),
      ),
    ).toBe(false);
    expect(
      styleLocksTextSpacing(
        firstTag(
          `const A = () => <p style={{ ...base, lineHeight: "1.2 !important" }} />;`,
        ),
      ),
    ).toBe(true);
  });

  it("falls back to expression text for className", () => {
    expect(
      classNameTextOf(firstTag(`const A = () => <div className={cls} />;`)),
    ).toBe("{cls}");
  });

  it("handles self-closing tables for data-table checks", () => {
    const selfClosing = firstTag(`const A = () => <table />;`);
    expect(isDataTable(selfClosing)).toBe(false);
    expect(isComplexDataTable(selfClosing)).toBe(false);

    expect(
      isDataTable(
        firstTag(`const A = () => <table><tr><th>H</th></tr></table>;`),
      ),
    ).toBe(true);
    expect(
      isDataTable(
        firstTag(`const A = () => <table><tr><td>x</td></tr></table>;`),
      ),
    ).toBe(false);
  });

  it("detects expression colSpan values", () => {
    const spanned = firstTag(
      `const SPAN2 = 2; const A = () => <table><td colSpan={SPAN2}>x</td></table>;`,
    );
    expect(isComplexDataTable(spanned)).toBe(true);
  });

  it("skips self-closing rows and flags double thead", () => {
    const rowSkip = firstTag(
      `const A = () => <table><tr /><tr><td>x</td></tr></table>;`,
    );
    expect(isComplexDataTable(rowSkip)).toBe(false);

    const doubleThead = firstTag(
      `const A = () => <table><thead><tr><th>A</th></tr></thead><thead><tr><th>B</th></tr></thead></table>;`,
    );
    expect(isComplexDataTable(doubleThead)).toBe(true);
  });

  it("detects naming hosts through self-closing ancestors", () => {
    const findLabelInExpression = (source: string): ts.Node => {
      const parsed = parseSource("test.tsx", source);
      let target: ts.Node | undefined;
      const visit = (node: ts.Node): void => {
        if (
          ts.isIdentifier(node) &&
          node.text === "label" &&
          node.parent &&
          ts.isJsxExpression(node.parent)
        ) {
          target = node;
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed.sourceFile);
      if (!target) throw new Error("expected label identifier");
      return target;
    };

    expect(
      isInsideNamingHost(
        findLabelInExpression(`const A = () => <button aria-label={label} />;`),
      ),
    ).toBe(true);
    expect(
      isInsideNamingHost(
        findLabelInExpression(`const A = () => <div title={label} />;`),
      ),
    ).toBe(false);
  });

  it("resolves self-closing and href-fallback transcript links", () => {
    const videoWithSibling = (source: string): JsxTagNode => {
      const parsed = parseSource("test.tsx", source);
      let video: JsxTagNode | undefined;
      visitJsxTags(parsed.sourceFile, (node) => {
        if (!video && node.tagName.getText() === "video") video = node;
      });
      if (!video) throw new Error("expected video");
      return video;
    };

    expect(
      hasAdjacentTranscriptLink(
        videoWithSibling(
          `const A = () => (<div><video /><a href="transcript.html" /></div>);`,
        ),
      ),
    ).toBe(true);
    expect(
      hasAdjacentTranscriptLink(
        videoWithSibling(
          `const A = () => (<div><video /><a href="/talk-transcript">Click here</a></div>);`,
        ),
      ),
    ).toBe(true);
    expect(
      hasAdjacentTranscriptLink(
        videoWithSibling(
          `const A = () => (<div><video /><a href="/other.html" /></div>);`,
        ),
      ),
    ).toBe(false);
  });

  it("rejects empty aria-describedby references", () => {
    const parsed = parseSource(
      "test.tsx",
      `const A = () => (<div><video aria-describedby="   " /></div>);`,
    );
    let video: JsxTagNode | undefined;
    visitJsxTags(parsed.sourceFile, (node) => {
      if (!video && node.tagName.getText() === "video") video = node;
    });
    if (!video) throw new Error("expected video");
    expect(ariaDescribedByPointsToTranscript(video, parsed.sourceFile)).toBe(
      false,
    );

    const empty = parseSource(
      "test.tsx",
      `const A = () => (<div><video aria-describedby="" /></div>);`,
    );
    let emptyVideo: JsxTagNode | undefined;
    visitJsxTags(empty.sourceFile, (node) => {
      if (!emptyVideo && node.tagName.getText() === "video") emptyVideo = node;
    });
    if (!emptyVideo) throw new Error("expected video");
    expect(ariaDescribedByPointsToTranscript(emptyVideo, empty.sourceFile)).toBe(
      false,
    );
  });
});

function elementFor(
  parsed: ReturnType<typeof parseSource>,
  tagName: string,
) {
  let found: JsxTagNode | undefined;
  visitJsxTags(parsed.sourceFile, (node) => {
    if (!found && node.tagName.getText() === tagName) found = node;
  });
  if (!found) throw new Error(`expected <${tagName}>`);
  const element = jsxElementOf(found);
  if (!element) throw new Error(`expected element for <${tagName}>`);
  return element;
}
