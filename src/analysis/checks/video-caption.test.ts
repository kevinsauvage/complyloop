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

  it("warns on YouTube and Vimeo embeds instead of passing 4.3", () => {
    const youtube = videoCaptionCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <iframe src="https://www.youtube.com/embed/abc" title="Talk" />;`,
      ),
    );
    expect(youtube).toHaveLength(1);
    expect(youtube[0]?.kind).toBe("warning");
    expect(youtube[0]?.confidence).toBe("low");

    const vimeo = videoCaptionCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <iframe src="https://player.vimeo.com/video/123" title="Talk" />;`,
      ),
    );
    expect(vimeo).toHaveLength(1);
    expect(vimeo[0]?.kind).toBe("warning");
  });

  it("does not flag unrelated iframes", () => {
    expect(
      videoCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <iframe src="https://maps.example.com" title="Map" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
