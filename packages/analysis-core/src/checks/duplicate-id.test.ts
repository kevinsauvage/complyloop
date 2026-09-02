import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { duplicateIdCheck } from "./duplicate-id";

describe("duplicate-id", () => {
  it("flags repeated id values in a file", () => {
    const findings = duplicateIdCheck.run(
      parseSource("test.tsx", `const A = () => (<div><span id="x" /><button id="x" /></div>);`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toContain('id="x"');
  });

  it("reports each occurrence after the first", () => {
    const findings = duplicateIdCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div><span id="x" /><button id="x" /><i id="x" /></div>);`,
      ),
    );
    expect(findings).toHaveLength(2);
  });

  it("ignores unique, empty, and dynamic ids", () => {
    expect(
      duplicateIdCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><span id="a" /><button id="b" /><i id="" /><b id={id} /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});
