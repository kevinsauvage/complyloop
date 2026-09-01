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

  it("warns on CSS animation and Tailwind motion classes", () => {
    const styleFindings = noBlinkMarqueeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <div style={{ animation: "spin 1s linear infinite" }}>Go</div>;`,
      ),
    );
    expect(styleFindings).toHaveLength(1);
    expect(styleFindings[0]?.kind).toBe("warning");

    const classFindings = noBlinkMarqueeCheck.run(
      parseSource("test.tsx", `const A = () => <div className="animate-spin">Go</div>;`),
    );
    expect(classFindings).toHaveLength(1);
    expect(classFindings[0]?.kind).toBe("warning");
  });

  it("does not flag CSS transitions as moving content", () => {
    expect(
      noBlinkMarqueeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div style={{ transition: "opacity 0.2s" }}>Fade</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("does not treat animate-none or animation none as moving content", () => {
    expect(
      noBlinkMarqueeCheck.run(
        parseSource("test.tsx", `const A = () => <div className="animate-none">Still</div>;`),
      ),
    ).toHaveLength(0);
    expect(
      noBlinkMarqueeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div style={{ animation: "none" }}>Still</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on carousel hosts and does not pass because of prefers-reduced-motion", () => {
    const findings = noBlinkMarqueeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <div>
            <Carousel aria-roledescription="carousel" />
            <style>{"@media (prefers-reduced-motion: reduce) { * { animation: none } }"}</style>
          </div>
        );`,
      ),
    );
    expect(findings.some((finding) => finding.kind === "warning")).toBe(true);
  });
});
