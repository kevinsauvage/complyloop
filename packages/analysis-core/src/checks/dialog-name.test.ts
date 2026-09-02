import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { dialogNameCheck } from "./dialog-name";

describe("dialog-name", () => {
  it("flags a nameless dialog role", () => {
    expect(
      dialogNameCheck.run(
        parseSource("test.tsx", `const A = () => <div role="dialog"><p>Body</p></div>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts aria-labelledby and native dialog with aria-label", () => {
    expect(
      dialogNameCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <div role="dialog" aria-labelledby="t"><h2 id="t">Edit</h2></div>
              <dialog aria-label="Confirm delete"><p>Sure?</p></dialog>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
