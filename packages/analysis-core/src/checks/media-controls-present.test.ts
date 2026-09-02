import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { mediaControlsPresentCheck } from "./media-controls-present";

describe("media-controls-present", () => {
  it("flags video without controls", () => {
    expect(
      mediaControlsPresentCheck.run(
        parseSource("test.tsx", `const A = () => <video src="/x.mp4" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts native controls", () => {
    expect(
      mediaControlsPresentCheck.run(
        parseSource("test.tsx", `const A = () => <video src="/x.mp4" controls />;`),
      ),
    ).toHaveLength(0);
  });

  it("accepts custom player with keyboard handlers", () => {
    expect(
      mediaControlsPresentCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <video src="/x.mp4" onKeyDown={() => {}} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
