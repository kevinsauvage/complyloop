import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { pointerGestureCheck } from "./pointer-gesture";

describe("pointer-gesture", () => {
  it("flags a custom element with a pointer handler and no keyboard handler", () => {
    const findings = pointerGestureCheck.run(
      parseSource("test.tsx", `const A = () => <div onPointerDown={() => drag()}>x</div>;`),
    );
    expect(findings).toHaveLength(1);
    expect(
      findings.every((finding) => finding.kind === "warning" && finding.confidence === "low"),
    ).toBe(true);
  });

  it("ignores native interactive elements", () => {
    expect(
      pointerGestureCheck.run(
        parseSource("test.tsx", `const A = () => <button onPointerDown={drag}>x</button>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores a pointer handler that also has onKeyDown", () => {
    expect(
      pointerGestureCheck.run(
        parseSource("test.tsx", `const A = () => <div onPointerDown={drag} onKeyDown={onKey}>x</div>;`),
      ),
    ).toHaveLength(0);
  });
});
