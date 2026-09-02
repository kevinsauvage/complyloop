import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { tableCaptionCheck } from "./table-caption";

describe("table-caption", () => {
  it("flags a data table without a caption", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><th>Name</th></tr>
              <tr><td>Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a caption or labelled data table", () => {
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <caption>Staff</caption>
              <tr><th>Name</th></tr>
              <tr><td>Ada</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table aria-labelledby="t">
              <tr><th>Name</th></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores layout tables and tables without headers", () => {
    expect(
      tableCaptionCheck.run(
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
    expect(
      tableCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <table>
              <tr><td>Only data</td></tr>
            </table>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
