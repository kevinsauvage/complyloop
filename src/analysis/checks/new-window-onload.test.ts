import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { newWindowOnloadCheck } from "./new-window-onload";

describe("new-window-onload", () => {
  it("flags window.open in mount useEffect", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => { useEffect(() => { window.open("/promo"); }, []); return null; };`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores window.open inside click handlers", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <button onClick={() => window.open("/help")}>Help</button>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
