import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { videoCaptionCheck } from "./video-caption";

describe("video-caption", () => {
  it("flags a video with no captions track", () => {
    const findings = videoCaptionCheck.run(
      parseSource("test.tsx", `const A = () => <video src="/talk.mp4" controls />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("video-caption");
    expect(findings[0]?.kind).toBe("violation");
  });

  it("accepts a video with a captions track", () => {
    expect(
      videoCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <video controls>
              <source src="/talk.mp4" />
              <track kind="captions" src="/talk.vtt" srcLang="en" />
            </video>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts subtitles as a captions equivalent", () => {
    expect(
      videoCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <video controls>
              <track kind="subtitles" src="/talk.vtt" srcLang="fr" />
            </video>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
