import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { redundantRoleCheck } from "./redundant-role";

describe("redundant-role", () => {
  it("flags a native button with role=button", () => {
    expect(
      redundantRoleCheck.run(
        parseSource("test.tsx", `const A = () => <button role="button">Save</button>;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts a custom widget role and a native control without a role", () => {
    expect(
      redundantRoleCheck.run(
        parseSource("test.tsx", `const A = () => <div role="button">Save</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      redundantRoleCheck.run(
        parseSource("test.tsx", `const A = () => <button>Save</button>;`),
      ),
    ).toHaveLength(0);
  });
});
