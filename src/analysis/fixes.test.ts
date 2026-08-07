import { describe, expect, it } from "vitest";
import { applyFix, previewFixedLine } from "./fixes";
import { parseSource } from "./parse";
import { autoplayMediaCheck } from "./checks/autoplay-media";
import { buttonNameCheck } from "./checks/button-name";
import { imgAltCheck } from "./checks/img-alt";
import { positiveTabindexCheck } from "./checks/positive-tabindex";

describe("applyFix", () => {
  it("inserts an attribute into a self-closing element and passes the re-check", () => {
    const source = `const A = () => <img src="/team.png" />;`;
    const [finding] = imgAltCheck.run(parseSource("a.tsx", source));
    if (finding.fix?.kind !== "insert_attribute") throw new Error("expected an insert fix");

    const fixed = applyFix(source, { ...finding.fix, value: "Team photo" });
    expect(fixed).toContain(`<img src="/team.png" alt="Team photo" />`);
    expect(imgAltCheck.run(parseSource("a.tsx", fixed))).toHaveLength(0);
  });

  it("inserts an attribute into a non-self-closing element and passes the re-check", () => {
    const source = `const A = () => <button><svg /></button>;`;
    const [finding] = buttonNameCheck.run(parseSource("a.tsx", source));
    if (finding.fix?.kind !== "insert_attribute") throw new Error("expected an insert fix");

    const fixed = applyFix(source, { ...finding.fix, value: "Open menu" });
    expect(fixed).toContain(`<button aria-label="Open menu">`);
    expect(buttonNameCheck.run(parseSource("a.tsx", fixed))).toHaveLength(0);
  });

  it("replaces an attribute value and passes the re-check", () => {
    const source = `const A = () => <input tabIndex={3} aria-label="x" />;`;
    const [finding] = positiveTabindexCheck.run(parseSource("a.tsx", source));
    if (!finding.fix) throw new Error("expected a fix");

    const fixed = applyFix(source, finding.fix);
    expect(fixed).toContain("tabIndex={0}");
    expect(positiveTabindexCheck.run(parseSource("a.tsx", fixed))).toHaveLength(0);
  });

  it("removes an attribute and passes the autoplay re-check", () => {
    const source = `const A = () => <video src="/x.mp4" autoPlay />;`;
    const [finding] = autoplayMediaCheck.run(parseSource("a.tsx", source));
    if (!finding.fix) throw new Error("expected a fix");

    const fixed = applyFix(source, finding.fix);
    expect(fixed).not.toMatch(/autoPlay/i);
    expect(autoplayMediaCheck.run(parseSource("a.tsx", fixed))).toHaveLength(0);
  });

  it("previews the fixed line without mutating the source", () => {
    const source = `const A = () => <img src="/team.png" />;`;
    const [finding] = imgAltCheck.run(parseSource("a.tsx", source));
    if (!finding.fix) throw new Error("expected a fix");

    const preview = previewFixedLine(
      source,
      finding.fix,
      finding.location.kind === "source" ? finding.location.line : 1,
    );
    expect(preview).toContain(`alt="Team"`);
    expect(source).not.toContain("alt=");
  });
});
