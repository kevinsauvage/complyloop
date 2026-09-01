import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaRequiredAttrCheck } from "./aria-required-attr";

describe("aria-required-attr", () => {
  it("flags a checkbox role without aria-checked", () => {
    const findings = ariaRequiredAttrCheck.run(
      parseSource("test.tsx", `const A = () => <div role="checkbox">x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.fix).toMatchObject({
      kind: "insert_attribute",
      attribute: "aria-checked",
      value: "false",
    });
  });

  it("suggests defaults for heading, slider, scrollbar, and option roles", () => {
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <div role="heading">x</div>;`),
      )[0]?.fix,
    ).toMatchObject({ attribute: "aria-level", value: "2" });
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <div role="slider">x</div>;`),
      )[0]?.fix,
    ).toMatchObject({ attribute: "aria-valuenow", value: "0" });
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <div role="scrollbar">x</div>;`),
      )[0]?.fix,
    ).toMatchObject({ attribute: "aria-controls", value: "controlled-id" });
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <div role="option">x</div>;`),
      )[0]?.fix,
    ).toMatchObject({ attribute: "aria-selected", value: "false" });
  });

  it("lists all missing required props for combobox", () => {
    const findings = ariaRequiredAttrCheck.run(
      parseSource("test.tsx", `const A = () => <div role="combobox">x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("aria-controls");
    expect(findings[0]?.reason).toContain("aria-expanded");
  });

  it("accepts when required props are present", () => {
    expect(
      ariaRequiredAttrCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div role="checkbox" aria-checked="true">x</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts native elements that imply the required properties", () => {
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <input type="checkbox" role="checkbox" />;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <h2 role="heading">x</h2>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <input type="radio" role="radio" />;`),
      ),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts, non-DOM hosts, and roles without requirements", () => {
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = (p) => <div role="checkbox" {...p}>x</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <Box role="checkbox">x</Box>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaRequiredAttrCheck.run(
        parseSource("test.tsx", `const A = () => <div role="button">x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
