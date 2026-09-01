import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { keyboardInteractionCheck } from "./keyboard-interaction";

describe("keyboard-interaction", () => {
  it("flags a static div with onClick and no keyboard support", () => {
    const findings = keyboardInteractionCheck.run(
      parseSource("test.tsx", `const A = () => <div onClick={() => {}}>x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/keyboard/i);
    expect(findings[0]?.reason).toMatch(/interactive role/);
    expect(findings[0]?.reason).toMatch(/tabIndex/);
  });

  it("accepts a native button and a complete custom widget", () => {
    expect(
      keyboardInteractionCheck.run(
        parseSource("test.tsx", `const A = () => <button onClick={() => {}}>Save</button>;`),
      ),
    ).toHaveLength(0);
    expect(
      keyboardInteractionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div role="button" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>x</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags hover without focus/blur pairing", () => {
    const findings = keyboardInteractionCheck.run(
      parseSource("test.tsx", `const A = () => <div onMouseOver={() => {}}>x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/onFocus/);
  });

  it("flags mouse out without onBlur", () => {
    const findings = keyboardInteractionCheck.run(
      parseSource("test.tsx", `const A = () => <div onMouseOut={() => {}}>x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/onBlur/);
  });

  it("skips aria-hidden, presentation, and prop-spreading hosts", () => {
    expect(
      keyboardInteractionCheck.run(
        parseSource("test.tsx", `const A = () => <div aria-hidden="true" onClick={() => {}}>x</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      keyboardInteractionCheck.run(
        parseSource("test.tsx", `const A = () => <div role="presentation" onClick={() => {}}>x</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      keyboardInteractionCheck.run(
        parseSource("test.tsx", `const A = (p) => <div onClick={() => {}} {...p}>x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
