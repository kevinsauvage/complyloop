import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { autocompleteValidCheck } from "./autocomplete-valid";

describe("autocomplete-valid", () => {
  it("flags invalid autocomplete tokens", () => {
    const findings = autocompleteValidCheck.run(
      parseSource("test.tsx", `const A = () => <input autoComplete="not-a-real-token" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("not-a-real-token");
  });

  it("accepts valid tokens including section and grouping prefixes", () => {
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <input autoComplete="email" />;`),
      ),
    ).toHaveLength(0);
    expect(
      autocompleteValidCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input autocomplete="section-billing shipping email" />;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <input autoComplete="optional given-name" />;`),
      ),
    ).toHaveLength(0);
  });

  it("flags empty token sets and invalid tokens on select/textarea", () => {
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <input autoComplete="   " />;`),
      ),
    ).toHaveLength(1);
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <select autoComplete="nope" />;`),
      ),
    ).toHaveLength(1);
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <textarea autoComplete="xyz" />;`),
      ),
    ).toHaveLength(1);
  });

  it("skips dynamic values and non-form controls", () => {
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <input autoComplete={value} />;`),
      ),
    ).toHaveLength(0);
    expect(
      autocompleteValidCheck.run(
        parseSource("test.tsx", `const A = () => <div autoComplete="email" />;`),
      ),
    ).toHaveLength(0);
  });
});
