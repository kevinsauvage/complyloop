import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { accessibleAuthCheck } from "./accessible-auth";

describe("accessible-auth", () => {
  it("flags password field with autocomplete off", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="password" autoComplete="off" aria-label="Password" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags paste blocking on login field", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <input
              type="password"
              autoComplete="current-password"
              onPaste={(e) => e.preventDefault()}
              aria-label="Password"
            />
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts standard password autocomplete", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="password" autoComplete="current-password" aria-label="Password" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
