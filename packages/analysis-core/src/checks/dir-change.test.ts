import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { dirChangeCheck } from "./dir-change";

describe("dir-change", () => {
  it("warns when RTL text lacks dir in a mixed file", () => {
    const findings = dirChangeCheck.run(
      parseSource("test.tsx", `const A = () => <p>Hello שלום world</p>;`),
    );
    expect(findings.some((f) => f.checkId === "dir-change")).toBe(true);
  });

  it("accepts RTL text inside dir=rtl", () => {
    expect(
      dirChangeCheck.run(
        parseSource("test.tsx", `const A = () => <p dir="rtl">שלום</p><p>Hello</p>;`),
      ),
    ).toHaveLength(0);
  });
});
