import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { reducedMotionCheck } from "./reduced-motion";

describe("reduced-motion", () => {
  it("warns on interaction animation without motion-reduce fallback", () => {
    const findings = reducedMotionCheck.run(
      parseSource(
        "menu.tsx",
        `const Menu = () => (
          <button className="animate-in fade-in" onClick={() => {}}>Open</button>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "reduced-motion")).toBe(true);
  });

  it("accepts motion-reduce animation classes", () => {
    expect(
      reducedMotionCheck.run(
        parseSource(
          "menu.tsx",
          `const Menu = () => (
            <button className="animate-in fade-in motion-reduce:animate-none">Open</button>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
