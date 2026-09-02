import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { captionsLiveCheck } from "./captions-live";

describe("captions-live", () => {
  it("warns on live video without captions track", () => {
    const findings = captionsLiveCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <video src="/live/stream.m3u8" controls />;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("captions-live");
  });

  it("accepts live video with captions track", () => {
    expect(
      captionsLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <video src="/live/stream.m3u8" controls>
              <track kind="captions" src="/live.vtt" />
            </video>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores prerecorded video", () => {
    expect(
      captionsLiveCheck.run(
        parseSource("test.tsx", `const A = () => <video src="/talk.mp4" />;`),
      ),
    ).toHaveLength(0);
  });
});
