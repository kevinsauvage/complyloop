import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { emptyHeadingCheck } from "./empty-heading";

describe("empty-heading", () => {
  it("flags headings with no text", () => {
    const findings = emptyHeadingCheck.run(
      parseSource("test.tsx", `const A = () => <h2></h2>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkId: "empty-heading",
      kind: "violation",
      severity: "serious",
    });
    expect(findings[0]?.reason).toContain("no text content");
  });

  it("flags self-closing headings", () => {
    const findings = emptyHeadingCheck.run(
      parseSource("test.tsx", `const A = () => <h3 />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("<h3 />");
  });

  it("accepts text content and aria-label", () => {
    expect(
      emptyHeadingCheck.run(parseSource("test.tsx", `const A = () => <h2>Section</h2>;`)),
    ).toHaveLength(0);
    expect(
      emptyHeadingCheck.run(
        parseSource("test.tsx", `const A = () => <h2 aria-label="Section"></h2>;`),
      ),
    ).toHaveLength(0);
  });

  it("does not treat title alone as a name (includeTitle: false)", () => {
    expect(
      emptyHeadingCheck.run(
        parseSource("test.tsx", `const A = () => <h2 title="Section"></h2>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores non-heading tags", () => {
    expect(
      emptyHeadingCheck.run(parseSource("test.tsx", `const A = () => <p></p>;`)),
    ).toHaveLength(0);
  });
});
