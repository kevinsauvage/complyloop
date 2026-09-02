import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { ariaActivedescendantCheck } from "./aria-activedescendant";

describe("aria-activedescendant", () => {
  it("flags aria-activedescendant on a host that cannot take keyboard focus", () => {
    expect(
      ariaActivedescendantCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div role="listbox" aria-activedescendant="opt-1">
              <div id="opt-1" role="option">One</div>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a tabbable composite", () => {
    expect(
      ariaActivedescendantCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div role="listbox" tabIndex={0} aria-activedescendant="opt-1">
              <div id="opt-1" role="option">One</div>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
