import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { fieldGroupingCheck } from "./field-grouping";

describe("field-grouping", () => {
  it("flags related checkbox groups outside fieldsets", () => {
    const findings = fieldGroupingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <div>
            <input type="checkbox" name="interests" value="a11y" />
            <input type="checkbox" name="interests" value="security" />
          </div>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags identity autocomplete pairs without grouping", () => {
    const findings = fieldGroupingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <>
            <input autocomplete="given-name" />
            <input autocomplete="family-name" />
          </>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/group/i);
  });

  it("accepts related fields grouped in a fieldset", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <fieldset>
              <legend>Identity</legend>
              <input autocomplete="given-name" />
              <input autocomplete="family-name" />
            </fieldset>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
