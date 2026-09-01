import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaPropsCheck } from "./aria-props";

describe("aria-props", () => {
  it("flags unknown aria-* attributes", () => {
    const findings = ariaPropsCheck.run(
      parseSource("test.tsx", `const A = () => <div aria-lable="x">x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("aria-lable");
  });

  it("accepts valid ARIA properties", () => {
    expect(
      ariaPropsCheck.run(
        parseSource("test.tsx", `const A = () => <div aria-label="Close">x</div>;`),
      ),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts and non-DOM components", () => {
    expect(
      ariaPropsCheck.run(
        parseSource("test.tsx", `const A = (p) => <div aria-lable="x" {...p}>x</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaPropsCheck.run(parseSource("test.tsx", `const A = () => <Box aria-lable="x">x</Box>;`)),
    ).toHaveLength(0);
  });
});
