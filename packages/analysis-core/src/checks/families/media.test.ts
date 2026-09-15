import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse";
import {
  audioCaptionCheck,
  audioDescriptionOrAltCheck,
  audioDescriptionTrackCheck,
  autoplayMediaCheck,
  captionsLiveCheck,
  imageDetailedDescriptionCheck,
  mediaControlsPresentCheck,
  mediaKeyboardStaticCheck,
  nontemporalMediaAltCheck,
  officeDocsAltPresentCheck,
  videoCaptionCheck,
} from "./media";

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

describe("audio-caption", () => {
  it("flags audio without a captions or descriptions track", () => {
    expect(
      audioCaptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <audio src="/podcast.mp3" controls />;`,
        ),
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

describe("audio-description-or-alt", () => {
  it("warns on video without description track or transcript", () => {
    const findings = audioDescriptionOrAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <video src="/talk.mp4" controls />;`,
      ),
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

describe("audio-description-track", () => {
  it("warns on video without descriptions track", () => {
    const findings = audioDescriptionTrackCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <video src="/talk.mp4" controls />;`,
      ),
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

describe("video-caption", () => {
  it("flags a video with no captions track", () => {
    const findings = videoCaptionCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <video src="/talk.mp4" controls />;`,
      ),
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
        parseSource(
          "test.tsx",
          `const A = () => <video src="/x.mp4" controls />;`,
        ),
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

describe("media-keyboard-static", () => {
  it("flags object without keyboard path", () => {
    expect(
      mediaKeyboardStaticCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <object data="/chart.svg" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts object with tabIndex", () => {
    expect(
      mediaKeyboardStaticCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <object data="/chart.svg" tabIndex={0} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("nontemporal-media-alt", () => {
  it("flags object, embed, and canvas without alternatives", () => {
    const findings = nontemporalMediaAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<><object data="/doc.pdf" /><embed src="/doc.pdf" /><canvas /></>);`,
      ),
    );

    expect(findings).toHaveLength(3);
    expect(findings.every((finding) => finding.kind === "violation")).toBe(
      true,
    );
  });

  it("accepts aria name, title, and canvas fallback text", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <object data="/doc.pdf" title="Brochure PDF" />
              <embed src="/doc.pdf" aria-label="Brochure PDF" />
              <canvas>Text fallback for chart</canvas>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts adjacent link or button alternatives", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <object data="/diagram.pdf" />
              <a href="/diagram.txt">Text alternative</a>
              <embed src="/report.pdf" />
              <button>Open text summary</button>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores image/* object and embed handled by img-alt", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<><object type="image/svg+xml" /><embed type="image/png" /></>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("image-detailed-description", () => {
  it("warns on chart-like images without a long description", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <img src="/sales-chart.png" alt="Sales" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts aria-describedby", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <img src="/chart.png" alt="Sales" aria-describedby="desc" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores decorative and simple images", () => {
    expect(
      imageDetailedDescriptionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <img src="/logo.png" alt="" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("office-docs-alt-present", () => {
  it("warns on office document link without adjacent alternative", () => {
    const findings = officeDocsAltPresentCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <a href="/guide.pdf">Guide</a>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("accepts office link with adjacent html alternative", () => {
    expect(
      officeDocsAltPresentCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <a href="/guide.pdf">Guide (PDF)</a>
              <a href="/guide.html">HTML version</a>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
