import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse";
import {
  buttonNameCheck,
  dialogNameCheck,
  summaryNameCheck,
  svgNameCheck,
  tabNameCheck,
} from "./names";

describe("button-name", () => {
  it("flags an icon-only button", () => {
    const findings = buttonNameCheck.run(
      parseSource("test.tsx", `const A = () => <button><svg /></button>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("accepts text content, aria-label, and expression children", () => {
    const source = `const A = () => (<div>
      <button>Save</button>
      <button aria-label="Close dialog"><svg /></button>
      <button>{label}</button>
    </div>);`;
    expect(buttonNameCheck.run(parseSource("test.tsx", source))).toHaveLength(
      0,
    );
  });

  it("skips spread hosts it cannot analyze", () => {
    expect(
      buttonNameCheck.run(
        parseSource("test.tsx", `const A = (p) => <button {...p} />;`),
      ),
    ).toHaveLength(0);
  });
});

describe("svg-name", () => {
  it("flags a standalone svg without an accessible name", () => {
    expect(
      svgNameCheck.run(
        parseSource("test.tsx", `const A = () => <svg viewBox="0 0 10 10" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts an svg with a titled child plus role=img", () => {
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg role="img" viewBox="0 0 10 10"><title>Sales chart</title></svg>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("still flags a titled svg without role=img", () => {
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg viewBox="0 0 10 10"><title>Sales chart</title></svg>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags an svg whose title child is empty", () => {
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg viewBox="0 0 10 10"><title /></svg>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts titled, labelled, or decorative svg", () => {
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg viewBox="0 0 10 10" aria-label="Chart">
              <circle r="4" />
            </svg>
          );`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg role="img" viewBox="0 0 10 10" aria-label="Chart">
              <circle r="4" />
            </svg>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <svg role="presentation" viewBox="0 0 10 10">
              <circle r="4" />
            </svg>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      svgNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <button>
              <svg viewBox="0 0 10 10"><circle r="4" /></svg>
              Save
            </button>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("tab-name", () => {
  it("flags a tab without an accessible name", () => {
    expect(
      tabNameCheck.run(
        parseSource("test.tsx", `const A = () => <div role="tab" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts a tab with text", () => {
    expect(
      tabNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <button role="tab">Profile</button>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("summary-name", () => {
  it("flags an empty summary", () => {
    expect(
      summaryNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <details><summary /></details>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a named summary", () => {
    expect(
      summaryNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <details><summary>More</summary>Body</details>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("dialog-name", () => {
  it("flags a nameless dialog role", () => {
    expect(
      dialogNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div role="dialog"><p>Body</p></div>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts aria-labelledby and native dialog with aria-label", () => {
    expect(
      dialogNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <div role="dialog" aria-labelledby="t"><h2 id="t">Edit</h2></div>
              <dialog aria-label="Confirm delete"><p>Sure?</p></dialog>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
