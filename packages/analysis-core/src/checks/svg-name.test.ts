import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { svgNameCheck } from "./svg-name";

describe("svg-name", () => {
  it("flags a standalone svg without an accessible name", () => {
    expect(
      svgNameCheck.run(
        parseSource("test.tsx", `const A = () => <svg viewBox="0 0 10 10" />;`),
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
