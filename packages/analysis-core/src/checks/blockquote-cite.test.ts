import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { blockquoteCiteCheck } from "./blockquote-cite";

describe("blockquote-cite", () => {
  it("flags blockquote cite without citation text", () => {
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote cite="https://example.com" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts blockquote with cite element", () => {
    expect(
      blockquoteCiteCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <blockquote cite="https://example.com"><cite>Ada</cite></blockquote>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
