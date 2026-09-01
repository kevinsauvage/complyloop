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

  it("accepts audio with an adjacent transcript link", () => {
    expect(
      audioCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <audio src="/podcast.mp3" controls />
              <a href="/transcript.html">Read transcript</a>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts audio with aria-describedby pointing to transcript text", () => {
    expect(
      audioCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <audio src="/podcast.mp3" controls aria-describedby="transcript" />
              <p id="transcript">Full transcription of the episode</p>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
