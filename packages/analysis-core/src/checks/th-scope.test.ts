import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { thScopeCheck } from "./th-scope";

describe("th-scope", () => {
  it("flags a th without scope or headers association", () => {
    expect(
      thScopeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><th>Name</th><td>Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts scope and headers/id pairing", () => {
    expect(
      thScopeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><th scope="col">Name</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      thScopeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><th id="n">Name</th></tr>
              <tr><td headers="n">Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores headers inside a layout table", () => {
    expect(
      thScopeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><th>X</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
