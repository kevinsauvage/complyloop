import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { layoutTableMarkupCheck } from "./layout-table-markup";

describe("layout-table-markup", () => {
  it("flags a presentation table that still has data-table markup", () => {
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><th>X</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a layout table of plain cells", () => {
    expect(
      layoutTableMarkupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table role="presentation">
              <tr><td>Logo</td><td>Nav</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
