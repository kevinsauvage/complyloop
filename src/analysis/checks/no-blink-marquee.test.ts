import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noBlinkMarqueeCheck } from "./no-blink-marquee";

describe("no-blink-marquee", () => {
  it("flags marquee and blink", () => {
    expect(
      noBlinkMarqueeCheck.run(
        parseSource("test.tsx", `const A = () => <marquee>News</marquee>;`),
      ),
    ).toHaveLength(1);
    expect(
      noBlinkMarqueeCheck.run(
        parseSource("test.tsx", `const A = () => <blink>Sale</blink>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores ordinary text", () => {
    expect(
      noBlinkMarqueeCheck.run(parseSource("test.tsx", `const A = () => <p>News</p>;`)),
    ).toHaveLength(0);
  });
});
