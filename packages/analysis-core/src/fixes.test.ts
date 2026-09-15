import { describe, expect, it } from "vitest";

import { autoplayMediaCheck } from "./checks/families/media";
import { buttonNameCheck } from "./checks/families/names";
import type { ProposedFix } from "./contract/finding-types";
import { applyFix, describeFix, previewFixedLine } from "./fixes";
import { parseSource } from "./parse";

describe("applyFix", () => {
  it("inserts an attribute into a self-closing element", () => {
    const source = `const A = () => <img src="/team.png" />;`;
    const start = source.indexOf("<img");
    const end = source.indexOf("/>") + 2;
    const fix: ProposedFix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "Team photo",
      editable: true,
      span: { start, end },
    };
    expect(applyFix(source, fix)).toContain(
      `<img src="/team.png" alt="Team photo" />`,
    );
  });

  it("inserts an attribute into a non-self-closing element and passes the re-check", () => {
    const source = `const A = () => <button><svg /></button>;`;
    const [finding] = buttonNameCheck.run(parseSource("a.tsx", source));
    if (finding.fix?.kind !== "insert_attribute")
      throw new Error("expected an insert fix");

    const fixed = applyFix(source, { ...finding.fix, value: "Open menu" });
    expect(fixed).toContain(`<button aria-label="Open menu">`);
    expect(buttonNameCheck.run(parseSource("a.tsx", fixed))).toHaveLength(0);
  });

  it("replaces an attribute value", () => {
    const source = `const A = () => <input tabIndex={3} aria-label="x" />;`;
    const token = "tabIndex={3}";
    const start = source.indexOf(token);
    const fix: ProposedFix = {
      kind: "replace_attribute_value",
      attribute: "tabIndex",
      replacementText: "tabIndex={0}",
      span: { start, end: start + token.length },
    };
    expect(applyFix(source, fix)).toContain("tabIndex={0}");
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
    const source = `const A = () => <button></button>;`;
    const [finding] = buttonNameCheck.run(parseSource("a.tsx", source));
    if (!finding.fix) throw new Error("expected a fix");

    const preview = previewFixedLine(
      source,
      finding.fix,
      finding.location.kind === "source" ? finding.location.line : 1,
    );
    expect(preview).toContain(`aria-label="Describe this action"`);
    expect(source).not.toContain("aria-label=");
  });

  it("returns an empty preview when the line is out of range", () => {
    const fix: ProposedFix = {
      kind: "remove_attribute",
      attribute: "autoPlay",
      span: { start: 0, end: 0 },
    };
    expect(previewFixedLine("x", fix, 99)).toBe("");
  });

  it("throws on an unknown fix kind at runtime", () => {
    expect(() =>
      applyFix("x", { kind: "unknown" } as unknown as ProposedFix),
    ).toThrow(/Unhandled fix kind/);
  });
});

describe("describeFix", () => {
  it("describes insert, replace, and remove fixes", () => {
    expect(
      describeFix({
        kind: "insert_attribute",
        attribute: "alt",
        value: "Hero",
        editable: true,
        span: { start: 0, end: 1 },
      }),
    ).toBe('Add alt="Hero" to the element');
    expect(
      describeFix({
        kind: "replace_attribute_value",
        attribute: "tabIndex",
        replacementText: "{0}",
        span: { start: 0, end: 1 },
      }),
    ).toBe("Replace the tabIndex value with {0}");
    expect(
      describeFix({
        kind: "remove_attribute",
        attribute: "autoPlay",
        span: { start: 0, end: 1 },
      }),
    ).toBe("Remove the autoPlay attribute");
  });

  it("throws on an unknown fix kind at runtime", () => {
    expect(() =>
      describeFix({ kind: "unknown" } as unknown as ProposedFix),
    ).toThrow(/Unhandled fix kind/);
  });
});
