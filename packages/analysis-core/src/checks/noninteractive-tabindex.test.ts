import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noninteractiveTabindexCheck } from "./noninteractive-tabindex";

describe("noninteractive-tabindex", () => {
  it("flags tabindex 0 on a generic element without a widget role or keyboard handler", () => {
    expect(
      noninteractiveTabindexCheck.run(
        parseSource("test.tsx", `const A = () => <div tabIndex={0}>Panel</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts widgets, native controls, and keyboard-handled hosts", () => {
    expect(
      noninteractiveTabindexCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div role="button" tabIndex={0}>Save</div>;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      noninteractiveTabindexCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div tabIndex={0} onKeyDown={fn}>Panel</div>;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      noninteractiveTabindexCheck.run(
        parseSource("test.tsx", `const A = () => <button tabIndex={0}>Save</button>;`),
      ),
    ).toHaveLength(0);
  });
});
