import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { focusContextChangeCheck } from "./focus-context-change";

describe("focus-context-change", () => {
  it("flags onFocus that navigates", () => {
    expect(
      focusContextChangeCheck.run(
        parseSource("test.tsx", `const A = () => <div onFocus={() => router.push("/x")}>x</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores onFocus without a context change", () => {
    expect(
      focusContextChangeCheck.run(
        parseSource("test.tsx", `const A = () => <div onFocus={() => setOpen(true)}>x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
