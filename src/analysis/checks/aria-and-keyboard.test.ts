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

  it("accepts concrete roles and skips dynamic values", () => {
    expect(
      run(ariaRoleCheck, `const A = () => <div role="button">x</div>;`),
    ).toHaveLength(0);
    expect(
      run(ariaRoleCheck, `const A = () => <div role={role}>x</div>;`),
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
    });
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
});
