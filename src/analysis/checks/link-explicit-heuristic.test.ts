import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { linkExplicitHeuristicCheck } from "./link-explicit-heuristic";

describe("link-explicit-heuristic", () => {
  it("warns on vague link text", () => {
    const findings = linkExplicitHeuristicCheck.run(
      parseSource("test.tsx", `const A = () => <a href="/report">Click here</a>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("accepts descriptive link text", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="/report">Download annual report</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
