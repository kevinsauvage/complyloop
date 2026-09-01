import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { tabNameCheck } from "./tab-name";

describe("tab-name", () => {
  it("flags a tab without an accessible name", () => {
    expect(
      tabNameCheck.run(parseSource("test.tsx", `const A = () => <div role="tab" />;`)),
    ).toHaveLength(1);
  });

  it("accepts a tab with text", () => {
    expect(
      tabNameCheck.run(
        parseSource("test.tsx", `const A = () => <button role="tab">Profile</button>;`),
      ),
    ).toHaveLength(0);
  });
});
