import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { sensoryCharacteristicsCheck } from "./sensory-characteristics";

describe("sensory-characteristics", () => {
  it("flags an instruction that relies on color", () => {
    expect(
      sensoryCharacteristicsCheck.run(
        parseSource("test.tsx", `const A = () => <p>Click the red button to continue</p>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores a plain instruction", () => {
    expect(
      sensoryCharacteristicsCheck.run(
        parseSource("test.tsx", `const A = () => <p>Click the button to continue</p>;`),
      ),
    ).toHaveLength(0);
  });
});
