import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { mediaKeyboardStaticCheck } from "./media-keyboard-static";

describe("media-keyboard-static", () => {
  it("flags object without keyboard path", () => {
    expect(
      mediaKeyboardStaticCheck.run(
        parseSource("test.tsx", `const A = () => <object data="/chart.svg" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts object with tabIndex", () => {
    expect(
      mediaKeyboardStaticCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <object data="/chart.svg" tabIndex={0} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
