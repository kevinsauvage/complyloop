import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaPropsCheck } from "./aria-props";
import { ariaRequiredAttrCheck } from "./aria-required-attr";
import { ariaRoleCheck } from "./aria-role";
import { keyboardInteractionCheck } from "./keyboard-interaction";
import { noAutofocusCheck } from "./no-autofocus";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

describe("aria-role", () => {
  it("flags abstract and invented roles", () => {
    expect(
      run(ariaRoleCheck, `const A = () => <div role="widget">x</div>;`),
    ).toHaveLength(1);
    expect(
      run(ariaRoleCheck, `const A = () => <div role="buton">x</div>;`),
    ).toHaveLength(1);
  });

  it("flags when any role in a space-separated list is invalid", () => {
    const findings = run(
      ariaRoleCheck,
      `const A = () => <div role="button widget">x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("widget");
  });

  it("accepts concrete roles and skips dynamic values", () => {
    expect(
      run(ariaRoleCheck, `const A = () => <div role="button">x</div>;`),
    ).toHaveLength(0);
    expect(
      run(ariaRoleCheck, `const A = () => <div role={role}>x</div>;`),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts and non-DOM components", () => {
    expect(
      run(
        ariaRoleCheck,
        `const A = (p) => <div role="widget" {...p}>x</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(ariaRoleCheck, `const A = () => <Box role="widget">x</Box>;`),
    ).toHaveLength(0);
  });
});

describe("aria-props", () => {
  it("flags unknown aria-* attributes", () => {
    const findings = run(
      ariaPropsCheck,
      `const A = () => <div aria-lable="x">x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("aria-lable");
  });

  it("accepts valid ARIA properties", () => {
    expect(
      run(ariaPropsCheck, `const A = () => <div aria-label="Close">x</div>;`),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts and non-DOM components", () => {
    expect(
      run(
        ariaPropsCheck,
        `const A = (p) => <div aria-lable="x" {...p}>x</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(ariaPropsCheck, `const A = () => <Box aria-lable="x">x</Box>;`),
    ).toHaveLength(0);
  });
});

describe("aria-required-attr", () => {
  it("flags a checkbox role without aria-checked", () => {
    const findings = run(
      ariaRequiredAttrCheck,
      `const A = () => <div role="checkbox">x</div>;`,
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
      run(ariaRequiredAttrCheck, `const A = () => <div role="heading">x</div>;`)[0]
        ?.fix,
    ).toMatchObject({ attribute: "aria-level", value: "2" });
    expect(
      run(ariaRequiredAttrCheck, `const A = () => <div role="slider">x</div>;`)[0]
        ?.fix,
    ).toMatchObject({ attribute: "aria-valuenow", value: "0" });
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = () => <div role="scrollbar">x</div>;`,
      )[0]?.fix,
    ).toMatchObject({ attribute: "aria-controls", value: "controlled-id" });
    expect(
      run(ariaRequiredAttrCheck, `const A = () => <div role="option">x</div>;`)[0]
        ?.fix,
    ).toMatchObject({ attribute: "aria-selected", value: "false" });
  });

  it("lists all missing required props for combobox", () => {
    const findings = run(
      ariaRequiredAttrCheck,
      `const A = () => <div role="combobox">x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("aria-controls");
    expect(findings[0]?.reason).toContain("aria-expanded");
  });

  it("accepts when required props are present", () => {
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = () => <div role="checkbox" aria-checked="true">x</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("accepts native elements that imply the required properties", () => {
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = () => <input type="checkbox" role="checkbox" />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(ariaRequiredAttrCheck, `const A = () => <h2 role="heading">x</h2>;`),
    ).toHaveLength(0);
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = () => <input type="radio" role="radio" />;`,
      ),
    ).toHaveLength(0);
  });

  it("skips prop-spreading hosts, non-DOM hosts, and roles without requirements", () => {
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = (p) => <div role="checkbox" {...p}>x</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        ariaRequiredAttrCheck,
        `const A = () => <Box role="checkbox">x</Box>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(ariaRequiredAttrCheck, `const A = () => <div role="button">x</div>;`),
    ).toHaveLength(0);
  });
});

describe("no-autofocus", () => {
  it("flags autoFocus and proposes removing it", () => {
    const findings = run(
      noAutofocusCheck,
      `const A = () => <input autoFocus />;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.fix).toMatchObject({
      kind: "remove_attribute",
      attribute: "autoFocus",
    });
  });
});

describe("keyboard-interaction", () => {
  it("flags a static div with onClick and no keyboard support", () => {
    const findings = run(
      keyboardInteractionCheck,
      `const A = () => <div onClick={() => {}}>x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/keyboard/i);
    expect(findings[0]?.reason).toMatch(/interactive role/);
    expect(findings[0]?.reason).toMatch(/tabIndex/);
  });

  it("accepts a native button and a complete custom widget", () => {
    expect(
      run(
        keyboardInteractionCheck,
        `const A = () => <button onClick={() => {}}>Save</button>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        keyboardInteractionCheck,
        `const A = () => <div role="button" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>x</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("flags hover without focus/blur pairing", () => {
    const findings = run(
      keyboardInteractionCheck,
      `const A = () => <div onMouseOver={() => {}}>x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/onFocus/);
  });

  it("flags mouse out without onBlur", () => {
    const findings = run(
      keyboardInteractionCheck,
      `const A = () => <div onMouseOut={() => {}}>x</div>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/onBlur/);
  });

  it("skips aria-hidden, presentation, and prop-spreading hosts", () => {
    expect(
      run(
        keyboardInteractionCheck,
        `const A = () => <div aria-hidden="true" onClick={() => {}}>x</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        keyboardInteractionCheck,
        `const A = () => <div role="presentation" onClick={() => {}}>x</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        keyboardInteractionCheck,
        `const A = (p) => <div onClick={() => {}} {...p}>x</div>;`,
      ),
    ).toHaveLength(0);
  });
});
