import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noAutofocusCheck } from "./no-autofocus";

describe("no-autofocus", () => {
  it("flags autoFocus and proposes removing it", () => {
    const findings = noAutofocusCheck.run(
      parseSource("test.tsx", `const A = () => <input autoFocus />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.fix).toMatchObject({
      kind: "remove_attribute",
      attribute: "autoFocus",
    });
  });
});
