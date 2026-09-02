import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaHiddenFocusableCheck } from "./aria-hidden-focusable";

describe("aria-hidden-focusable", () => {
  it("flags focusable elements with aria-hidden", () => {
    const findings = ariaHiddenFocusableCheck.run(
      parseSource("test.tsx", `const A = () => <button aria-hidden="true">x</button>;`),
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag aria-hidden={false}", () => {
    const findings = ariaHiddenFocusableCheck.run(
      parseSource("test.tsx", `const A = () => <button aria-hidden={false}>x</button>;`),
    );
    expect(findings).toHaveLength(0);
  });

  it("flags boolean shorthand aria-hidden on a focusable control", () => {
    const findings = ariaHiddenFocusableCheck.run(
      parseSource("test.tsx", `const A = () => <button aria-hidden>x</button>;`),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags widget roles, media, and tabindex that the old tag list missed", () => {
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <div role="button" aria-hidden="true">x</div>;`),
      ),
    ).toHaveLength(1);
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <video aria-hidden="true" />;`),
      ),
    ).toHaveLength(1);
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <div tabIndex={0} aria-hidden="true">x</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("does not flag non-focusable or disabled hosts", () => {
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <a aria-hidden="true">x</a>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <button disabled aria-hidden="true">x</button>;`),
      ),
    ).toHaveLength(0);
    expect(
      ariaHiddenFocusableCheck.run(
        parseSource("test.tsx", `const A = () => <div aria-hidden="true">x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
