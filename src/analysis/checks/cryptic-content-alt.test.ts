import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { crypticContentAltCheck } from "./cryptic-content-alt";

const ASCII_ART = [
  "+-----+",
  "| hi  |",
  "+-----+",
].join("\n");

describe("cryptic-content-alt", () => {
  it("flags ASCII art pre blocks without alternatives", () => {
    const findings = crypticContentAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<pre>${ASCII_ART}</pre>);`,
      ),
    );
    expect(findings.some((finding) => finding.kind === "violation")).toBe(true);
  });

  it("accepts ASCII art with aria-label", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<pre aria-label="Smiley face made of punctuation">${ASCII_ART}</pre>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on emoticon-only span without accessible name", () => {
    const findings = crypticContentAltCheck.run(
      parseSource("test.tsx", `const A = () => <span>:-)</span>;`),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.kind).toBe("warning");
  });
});
