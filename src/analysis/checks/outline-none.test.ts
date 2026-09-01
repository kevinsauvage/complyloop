import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { outlineNoneCheck } from "./outline-none";

describe("outline-none", () => {
  it("warns when outline-none has no focus replacement", () => {
    expect(
      outlineNoneCheck.run(
        parseSource("test.tsx", `const A = () => <button className="outline-none">Go</button>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts outline-none with focus-visible ring", () => {
    expect(
      outlineNoneCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <button className="outline-none focus-visible:ring-2">Go</button>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
