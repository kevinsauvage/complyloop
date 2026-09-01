import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { pAsHeadingCheck } from "./p-as-heading";

describe("p-as-heading", () => {
  it("warns when a paragraph is styled like a heading", () => {
    const findings = pAsHeadingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <p className="text-4xl font-bold">Section</p>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("ignores ordinary paragraphs and real headings", () => {
    expect(
      pAsHeadingCheck.run(parseSource("test.tsx", `const A = () => <p>Hello</p>;`)),
    ).toHaveLength(0);
    expect(
      pAsHeadingCheck.run(
        parseSource("test.tsx", `const A = () => <h1 className="text-4xl">Hello</h1>;`),
      ),
    ).toHaveLength(0);
  });
});
