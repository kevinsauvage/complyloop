import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { pointerCancellationCheck } from "./pointer-cancellation";

describe("pointer-cancellation", () => {
  it("flags a pointerdown without a cancel/up counterpart", () => {
    expect(
      pointerCancellationCheck.run(
        parseSource("test.tsx", `const A = () => <div onPointerDown={start}>x</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores a pointerdown with onPointerCancel", () => {
    expect(
      pointerCancellationCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div onPointerDown={start} onPointerCancel={abort}>x</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
