import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { videoCaptionCheck } from "./video-caption";
import { audioCaptionCheck } from "./audio-caption";
import { noBlinkMarqueeCheck } from "./no-blink-marquee";
import { textSpacingCheck } from "./text-spacing";
import { emptyThCheck } from "./empty-th";
import { dialogNameCheck } from "./dialog-name";
import { tabNameCheck } from "./tab-name";
import { summaryNameCheck } from "./summary-name";
import { pAsHeadingCheck } from "./p-as-heading";
import { fieldsetLegendCheck } from "./fieldset-legend";
import { autocompletePurposeCheck } from "./autocomplete-purpose";
import { noAccesskeyCheck } from "./no-accesskey";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

describe("video-caption", () => {
  it("flags a video with no captions track", () => {
    const findings = run(
      videoCaptionCheck,
      `const A = () => <video src="/talk.mp4" controls />;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("video-caption");
    expect(findings[0]?.kind).toBe("violation");
  });

  it("accepts a video with a captions track", () => {
    expect(
      run(
        videoCaptionCheck,
        `const A = () => (
          <video controls>
            <source src="/talk.mp4" />
            <track kind="captions" src="/talk.vtt" srcLang="en" />
          </video>
        );`,
      ),
    ).toHaveLength(0);
  });

  it("accepts subtitles as a captions equivalent", () => {
    expect(
      run(
        videoCaptionCheck,
        `const A = () => (
          <video controls>
            <track kind="subtitles" src="/talk.vtt" srcLang="fr" />
          </video>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("audio-caption", () => {
  it("flags audio without a captions or descriptions track", () => {
    expect(
      run(audioCaptionCheck, `const A = () => <audio src="/podcast.mp3" controls />;`),
    ).toHaveLength(1);
  });

  it("accepts audio with a descriptions track", () => {
    expect(
      run(
        audioCaptionCheck,
        `const A = () => (
          <audio controls>
            <track kind="descriptions" src="/podcast.vtt" />
          </audio>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("no-blink-marquee", () => {
  it("flags marquee and blink", () => {
    expect(
      run(noBlinkMarqueeCheck, `const A = () => <marquee>News</marquee>;`),
    ).toHaveLength(1);
    expect(
      run(noBlinkMarqueeCheck, `const A = () => <blink>Sale</blink>;`),
    ).toHaveLength(1);
  });

  it("ignores ordinary text", () => {
    expect(run(noBlinkMarqueeCheck, `const A = () => <p>News</p>;`)).toHaveLength(
      0,
    );
  });
});

describe("text-spacing", () => {
  it("flags inline spacing styles that use !important", () => {
    expect(
      run(
        textSpacingCheck,
        `const A = () => <p style={{ letterSpacing: "0.12em !important" }}>Hi</p>;`,
      ),
    ).toHaveLength(1);
  });

  it("ignores spacing styles without !important", () => {
    expect(
      run(
        textSpacingCheck,
        `const A = () => <p style={{ letterSpacing: "0.02em", lineHeight: 1.5 }}>Hi</p>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("empty-th", () => {
  it("flags an empty table header", () => {
    expect(
      run(emptyThCheck, `const A = () => <table><thead><tr><th /></tr></thead></table>;`),
    ).toHaveLength(1);
  });

  it("accepts a named header", () => {
    expect(
      run(
        emptyThCheck,
        `const A = () => <table><tr><th>Name</th><th aria-label="Actions" /></tr></table>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("dialog-name", () => {
  it("flags a nameless dialog role", () => {
    expect(
      run(dialogNameCheck, `const A = () => <div role="dialog"><p>Body</p></div>;`),
    ).toHaveLength(1);
  });

  it("accepts aria-labelledby and native dialog with aria-label", () => {
    expect(
      run(
        dialogNameCheck,
        `const A = () => (
          <div>
            <div role="dialog" aria-labelledby="t"><h2 id="t">Edit</h2></div>
            <dialog aria-label="Confirm delete"><p>Sure?</p></dialog>
          </div>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("tab-name", () => {
  it("flags a tab without an accessible name", () => {
    expect(
      run(tabNameCheck, `const A = () => <div role="tab" />;`),
    ).toHaveLength(1);
  });

  it("accepts a tab with text", () => {
    expect(
      run(tabNameCheck, `const A = () => <button role="tab">Profile</button>;`),
    ).toHaveLength(0);
  });
});

describe("summary-name", () => {
  it("flags an empty summary", () => {
    expect(
      run(summaryNameCheck, `const A = () => <details><summary /></details>;`),
    ).toHaveLength(1);
  });

  it("accepts a named summary", () => {
    expect(
      run(
        summaryNameCheck,
        `const A = () => <details><summary>More</summary>Body</details>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("p-as-heading", () => {
  it("warns when a paragraph is styled like a heading", () => {
    const findings = run(
      pAsHeadingCheck,
      `const A = () => <p className="text-4xl font-bold">Section</p>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("ignores ordinary paragraphs and real headings", () => {
    expect(run(pAsHeadingCheck, `const A = () => <p>Hello</p>;`)).toHaveLength(0);
    expect(
      run(pAsHeadingCheck, `const A = () => <h1 className="text-4xl">Hello</h1>;`),
    ).toHaveLength(0);
  });
});

describe("fieldset-legend", () => {
  it("flags a fieldset without a legend", () => {
    expect(
      run(
        fieldsetLegendCheck,
        `const A = () => <fieldset><input type="radio" name="x" /></fieldset>;`,
      ),
    ).toHaveLength(1);
  });

  it("flags radio groups that are not wrapped in a fieldset", () => {
    expect(
      run(
        fieldsetLegendCheck,
        `const A = () => (
          <div>
            <input type="radio" name="plan" value="a" />
            <input type="radio" name="plan" value="b" />
          </div>
        );`,
      ),
    ).toHaveLength(1);
  });

  it("accepts a fieldset with a legend and grouped radios", () => {
    expect(
      run(
        fieldsetLegendCheck,
        `const A = () => (
          <fieldset>
            <legend>Plan</legend>
            <input type="radio" name="plan" value="a" />
            <input type="radio" name="plan" value="b" />
          </fieldset>
        );`,
      ),
    ).toHaveLength(0);
  });
});

describe("autocomplete-purpose", () => {
  it("flags an email field without autocomplete", () => {
    expect(
      run(
        autocompletePurposeCheck,
        `const A = () => <input type="email" id="e" aria-label="Email" />;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts identity fields that declare autocomplete", () => {
    expect(
      run(
        autocompletePurposeCheck,
        `const A = () => <input type="email" autoComplete="email" aria-label="Email" />;`,
      ),
    ).toHaveLength(0);
  });

  it("ignores non-identity fields", () => {
    expect(
      run(
        autocompletePurposeCheck,
        `const A = () => <input type="search" aria-label="Search" />;`,
      ),
    ).toHaveLength(0);
  });
});

describe("no-accesskey", () => {
  it("flags accessKey and accesskey", () => {
    expect(
      run(noAccesskeyCheck, `const A = () => <button accessKey="s">Save</button>;`),
    ).toHaveLength(1);
    expect(
      run(noAccesskeyCheck, `const A = () => <a href="/" accesskey="h">Home</a>;`),
    ).toHaveLength(1);
  });

  it("ignores controls without accesskey", () => {
    expect(
      run(noAccesskeyCheck, `const A = () => <button>Save</button>;`),
    ).toHaveLength(0);
  });
});
