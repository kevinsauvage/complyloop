import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { autocompletePurposeCheck } from "./autocomplete-purpose";

describe("autocomplete-purpose", () => {
  it("flags an email field without autocomplete", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="email" id="e" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts identity fields that declare autocomplete", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="email" autoComplete="email" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-identity fields", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="search" aria-label="Search" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
