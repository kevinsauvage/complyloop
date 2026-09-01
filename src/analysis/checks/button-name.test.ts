import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { buttonNameCheck } from "./button-name";

describe("button-name", () => {
  it("flags an icon-only button", () => {
    const findings = buttonNameCheck.run(
      parseSource("test.tsx", `const A = () => <button><svg /></button>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("accepts text content, aria-label, and expression children", () => {
    const source = `const A = () => (<div>
      <button>Save</button>
      <button aria-label="Close dialog"><svg /></button>
      <button>{label}</button>
    </div>);`;
    expect(buttonNameCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });
});
