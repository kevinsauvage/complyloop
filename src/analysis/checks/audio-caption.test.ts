import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { audioCaptionCheck } from "./audio-caption";

describe("audio-caption", () => {
  it("flags audio without a captions or descriptions track", () => {
    expect(
      audioCaptionCheck.run(
        parseSource("test.tsx", `const A = () => <audio src="/podcast.mp3" controls />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts audio with a descriptions track", () => {
    expect(
      audioCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <audio controls>
              <track kind="descriptions" src="/podcast.vtt" />
            </audio>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
