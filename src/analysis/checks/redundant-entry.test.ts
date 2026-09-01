import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { redundantEntryCheck } from "./redundant-entry";

describe("redundant-entry", () => {
  it("warns when the same identity field appears twice", () => {
    const findings = redundantEntryCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <form>
            <input type="email" name="email" autoComplete="email" aria-label="Email" />
            <input type="email" name="email" autoComplete="email" aria-label="Confirm email" />
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "redundant-entry")).toBe(true);
  });

  it("accepts duplicate fields when a hidden carry-over exists", () => {
    expect(
      redundantEntryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <form>
              <input type="hidden" name="email" value="a@b.co" />
              <input type="email" name="email" autoComplete="email" aria-label="Email" />
              <input type="email" name="email" autoComplete="email" aria-label="Email again" />
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
