import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaRoleCheck } from "./aria-role";

describe("aria-role", () => {
  it("flags abstract and invented roles", () => {
    expect(
      ariaRoleCheck.run(parseSource("test.tsx", `const A = () => <div role="widget">x</div>;`)),
    ).toHaveLength(1);
    expect(
      ariaRoleCheck.run(parseSource("test.tsx", `const A = () => <div role="buton">x</div>;`)),
    ).toHaveLength(1);
  });

  it("flags when any role in a space-separated list is invalid", () => {
    const findings = ariaRoleCheck.run(
      parseSource("test.tsx", `const A = () => <div role="button widget">x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("widget");
  });

  it("accepts concrete roles and skips dynamic values", () => {
    expect(
      ariaRoleCheck.run(parseSource("test.tsx", `const A = () => <div role="button">x</div>;`)),
    ).toHaveLength(0);
    expect(
      ariaRoleCheck.run(parseSource("test.tsx", `const A = () => <div role={role}>x</div>;`)),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts and non-DOM components", () => {
    expect(
      ariaRoleCheck.run(
        parseSource("test.tsx", `const A = (p) => <div role="widget" {...p}>x</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaRoleCheck.run(parseSource("test.tsx", `const A = () => <Box role="widget">x</Box>;`)),
    ).toHaveLength(0);
  });
});
