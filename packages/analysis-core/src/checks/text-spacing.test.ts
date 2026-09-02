import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { textSpacingCheck } from "./text-spacing";

describe("text-spacing", () => {
  it("flags inline spacing styles that use !important", () => {
    expect(
      textSpacingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ letterSpacing: "0.12em !important" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores spacing styles without !important", () => {
    expect(
      textSpacingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ letterSpacing: "0.02em", lineHeight: 1.5 }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
