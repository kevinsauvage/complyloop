import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { bothColorsCheck } from "./both-colors";

describe("both-colors", () => {
  it("warns when inline style sets color without background", () => {
    expect(
      bothColorsCheck.run(
        parseSource("test.tsx", `const A = () => <p style={{ color: "red" }}>Hi</p>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts paired color and background", () => {
    expect(
      bothColorsCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ color: "red", backgroundColor: "white" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
