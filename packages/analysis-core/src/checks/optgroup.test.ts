import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { optgroupCheck } from "./optgroup";

describe("optgroup", () => {
  it("flags an optgroup without a label", () => {
    const findings = optgroupCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <select>
            <optgroup>
              <option>One</option>
            </optgroup>
          </select>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("optgroup");
  });

  it("accepts an optgroup with a label", () => {
    expect(
      optgroupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <select>
              <optgroup label="Fruit">
                <option>Apple</option>
              </optgroup>
            </select>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
