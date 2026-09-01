import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { summaryNameCheck } from "./summary-name";

describe("summary-name", () => {
  it("flags an empty summary", () => {
    expect(
      summaryNameCheck.run(
        parseSource("test.tsx", `const A = () => <details><summary /></details>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts a named summary", () => {
    expect(
      summaryNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <details><summary>More</summary>Body</details>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
