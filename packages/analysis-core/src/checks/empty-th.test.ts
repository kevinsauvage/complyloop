import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { emptyThCheck } from "./empty-th";

describe("empty-th", () => {
  it("flags an empty table header", () => {
    expect(
      emptyThCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table><thead><tr><th /></tr></thead></table>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a named header", () => {
    expect(
      emptyThCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <table><tr><th>Name</th><th aria-label="Actions" /></tr></table>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
