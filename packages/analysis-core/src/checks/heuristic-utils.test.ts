import { describe, expect, it } from "vitest";
import {
  jsxElementOf,
  parseSource,
  visitJsxElements,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import {
  ariaDescribedByPointsToTranscript,
  classNameTextOf,
  descendantTags,
  handlerTriggersContextChange,
  hasAdjacentTranscriptLink,
  hasChildTrackKind,
  isComplexDataTable,
  isInsideNamingHost,
  styleHasBackgroundImage,
  styleLocksTextSpacing,
  textContentOf,
  walkMotionActuationCalls,
} from "./heuristic-utils";
import { hasAnyAttr } from "../parse";

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
  it("detects attributes, class names, and background-image styles", () => {
    const tagged = firstTag(
      `const A = () => <div className="card" style={{ backgroundImage: "url(x)" }} data-ok />`,
    );
    expect(hasAnyAttr(tagged, ["data-ok"])).toBe(true);
    expect(hasAnyAttr(tagged, ["missing"])).toBe(false);
    expect(classNameTextOf(tagged)).toBe("card");
    expect(styleHasBackgroundImage(tagged)).toBe(true);

    const classAttr = firstTag(`const A = () => <div class="plain" />;`);
    expect(classNameTextOf(classAttr)).toBe("plain");
    expect(classNameTextOf(firstTag(`const A = () => <div />;`))).toBe("");
    expect(
      styleHasBackgroundImage(firstTag(`const A = () => <div style={{ color: "red" }} />;`)),
    ).toBe(false);
  });

  it("detects context-changing handlers and motion listeners", () => {
    expect(
      handlerTriggersContextChange(
        firstTag(`const A = () => <button onClick={() => router.push("/next")} />;`),
        ["onClick"],
      ),
    ).toBe(true);
    expect(
      handlerTriggersContextChange(
        firstTag(`const A = () => <button onClick={() => setOpen(true)} />;`),
        ["onClick"],
      ),
    ).toBe(false);

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
