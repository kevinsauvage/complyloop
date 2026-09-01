import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { inputContextChangeCheck } from "./input-context-change";

describe("input-context-change", () => {
  it("flags onChange that submits", () => {
    expect(
      inputContextChangeCheck.run(
        parseSource("test.tsx", `const A = () => <input onChange={() => form.submit()} />;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores a benign onChange", () => {
    expect(
      inputContextChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input onChange={(e) => setValue(e.target.value)} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
