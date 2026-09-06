import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { autoplayMediaCheck } from "./autoplay-media";

function run(source: string): unknown[] {
  return autoplayMediaCheck.run(parseSource("media.tsx", source));
}

describe("autoplay-media", () => {
  it("flags statically enabled autoplay", () => {
    for (const source of [
      `<video autoPlay src="x.mp4" />`,
      `<video autoPlay="true" src="x.mp4" />`,
      `<video autoPlay={true} src="x.mp4" />`,
    ]) {
      expect(run(source)).toHaveLength(1);
    }
  });

  it("ignores explicitly disabled or dynamic autoplay", () => {
    for (const source of [
      `<video src="x.mp4" />`,
      `<video autoPlay={false} src="x.mp4" />`,
      `<video autoPlay="false" src="x.mp4" />`,
      `<video autoPlay={prefersReducedMotion} src="x.mp4" />`,
      `<audio autoPlay={false} src="x.mp3" />`,
    ]) {
      expect(run(source)).toHaveLength(0);
    }
  });
});