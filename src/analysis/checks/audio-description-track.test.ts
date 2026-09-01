import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { audioDescriptionTrackCheck } from "./audio-description-track";

describe("audio-description-track", () => {
  it("warns on video without descriptions track", () => {
    const findings = audioDescriptionTrackCheck.run(
      parseSource("test.tsx", `const A = () => <video src="/talk.mp4" controls />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("accepts video with descriptions track", () => {
    expect(
      audioDescriptionTrackCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <video controls>
              <track kind="descriptions" src="/talk-ad.vtt" />
            </video>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
