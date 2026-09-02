import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { noBlinkMarqueeCheck } from "./no-blink-marquee";

function findingsFor(code: string) {
  return noBlinkMarqueeCheck.run(parseSource("test.tsx", code));
}

describe("no-blink-marquee", () => {
  it("flags marquee and blink", () => {
    expect(findingsFor(`const A = () => <marquee>News</marquee>;`)).toHaveLength(
      1,
    );
    expect(findingsFor(`const A = () => <blink>Sale</blink>;`)).toHaveLength(1);
  });

  it("ignores ordinary text", () => {
    expect(findingsFor(`const A = () => <p>News</p>;`)).toHaveLength(0);
  });

  it("warns on infinite CSS animation and looping Tailwind utilities", () => {
    const styleFindings = findingsFor(
      `const A = () => <div style={{ animation: "spin 1s linear infinite" }}>Go</div>;`,
    );
    expect(styleFindings).toHaveLength(1);
    expect(styleFindings[0]?.kind).toBe("warning");

    expect(
      findingsFor(`const A = () => <div className="animate-spin">Go</div>;`),
    ).toHaveLength(1);
    expect(
      findingsFor(`const A = () => <div className="animate-pulse">Go</div>;`),
    ).toHaveLength(1);
  });

  it("does not flag one-shot animations or entrance motion", () => {
    expect(
      findingsFor(
        `const A = () => <div style={{ animation: "fadeIn 0.3s ease" }}>Fade</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      findingsFor(
        `const A = () => <div style={{ animationIterationCount: 1, animationName: "fade" }}>Fade</div>;`,
      ),
    ).toHaveLength(0);
    expect(
      findingsFor(
        `const A = () => <div className="animate-in fade-in duration-300">Fade</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("does not flag CSS transitions as moving content", () => {
    expect(
      findingsFor(
        `const A = () => <div style={{ transition: "opacity 0.2s" }}>Fade</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("does not treat animate-none or animation none as moving content", () => {
    expect(
      findingsFor(`const A = () => <div className="animate-none">Still</div>;`),
    ).toHaveLength(0);
    expect(
      findingsFor(
        `const A = () => <div style={{ animation: "none" }}>Still</div>;`,
      ),
    ).toHaveLength(0);
  });

  it("warns on carousel hosts and does not pass because of prefers-reduced-motion", () => {
    const findings = findingsFor(
      `const A = () => (
        <div>
          <Carousel aria-roledescription="carousel" />
          <style>{"@media (prefers-reduced-motion: reduce) { * { animation: none } }"}</style>
        </div>
      );`,
    );
    expect(findings.some((finding) => finding.kind === "warning")).toBe(true);
  });

  it("does not warn when carousel autoplay is disabled", () => {
    expect(
      findingsFor(`const A = () => <Carousel autoplay={false} />;`),
    ).toHaveLength(0);
  });

  it("does not warn when infinite motion has a pause control", () => {
    expect(
      findingsFor(
        `const A = () => (
          <div className="animate-spin">
            <button type="button" aria-label="Pause animation">II</button>
          </div>
        );`,
      ),
    ).toHaveLength(0);
  });

  it("still warns when autoplay is off but CSS motion has no pause control", () => {
    expect(
      findingsFor(
        `const A = () => <Carousel autoplay={false} className="animate-spin" />;`,
      ),
    ).toHaveLength(1);
  });
});
