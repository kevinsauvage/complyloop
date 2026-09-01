import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { audioDescriptionOrAltCheck } from "./audio-description-or-alt";

describe("audio-description-or-alt", () => {
  it("warns on video without description track or transcript", () => {
    const findings = audioDescriptionOrAltCheck.run(
      parseSource("test.tsx", `const A = () => <video src="/talk.mp4" controls />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("audio-description-or-alt");
  });

  it("accepts descriptions track", () => {
    expect(
      audioDescriptionOrAltCheck.run(
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

  it("accepts adjacent transcript link", () => {
    expect(
      audioDescriptionOrAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <video src="/talk.mp4" controls />
              <a href="/talk-transcript.txt">Transcript</a>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
