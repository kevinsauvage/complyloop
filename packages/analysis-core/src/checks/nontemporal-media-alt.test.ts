import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { nontemporalMediaAltCheck } from "./nontemporal-media-alt";

describe("nontemporal-media-alt", () => {
  it("flags object, embed, and canvas without alternatives", () => {
    const findings = nontemporalMediaAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<><object data="/doc.pdf" /><embed src="/doc.pdf" /><canvas /></>);`,
      ),
    );

    expect(findings).toHaveLength(3);
    expect(findings.every((finding) => finding.kind === "violation")).toBe(true);
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
