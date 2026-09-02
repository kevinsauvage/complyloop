import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { positiveTabindexCheck } from "./positive-tabindex";

describe("positive-tabindex", () => {
  it("flags tabIndex greater than zero with a replacement fix", () => {
    const findings = positiveTabindexCheck.run(
      parseSource("test.tsx", `const A = () => <input tabIndex={3} aria-label="x" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({
      kind: "replace_attribute_value",
      replacementText: "{0}",
    });
  });

  it("flags string and lowercase tabindex positives", () => {
    expect(
      positiveTabindexCheck.run(
        parseSource("test.tsx", `const A = () => <div tabIndex="2">x</div>;`),
      ),
    ).toHaveLength(1);
    expect(
      positiveTabindexCheck.run(
        parseSource("test.tsx", `const A = () => <div tabindex={4}>x</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts tabIndex of 0 and -1 and skips dynamic values", () => {
    const source = `const A = () => (<div><div tabIndex={0} /><div tabIndex={-1} /><div tabIndex={n} /></div>);`;
    expect(positiveTabindexCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });

  it("ignores boolean shorthand tabIndex", () => {
    expect(
      positiveTabindexCheck.run(
        parseSource("test.tsx", `const A = () => <div tabIndex>x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
