import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { fieldsetLegendCheck } from "./fieldset-legend";

describe("fieldset-legend", () => {
  it("flags a fieldset without a legend", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <fieldset><input type="radio" name="x" /></fieldset>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags radio groups that are not wrapped in a fieldset", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <input type="radio" name="plan" value="a" />
              <input type="radio" name="plan" value="b" />
            </div>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a fieldset with a legend and grouped radios", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <fieldset>
              <legend>Plan</legend>
              <input type="radio" name="plan" value="a" />
              <input type="radio" name="plan" value="b" />
            </fieldset>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
