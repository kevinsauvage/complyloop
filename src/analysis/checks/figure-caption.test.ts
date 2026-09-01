import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { figureCaptionCheck } from "./figure-caption";

describe("figure-caption", () => {
  it("flags a figure whose caption text is not in figcaption", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/chart.png" alt="Sales" />
              Sales by quarter
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts figcaption and figures with no caption text", () => {
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/chart.png" alt="Sales" />
              <figcaption>Sales by quarter</figcaption>
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      figureCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <figure>
              <img src="/photo.png" alt="A lake" />
            </figure>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
