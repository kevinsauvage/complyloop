import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { langChangeCheck } from "./lang-change";

describe("lang-change", () => {
  it("flags French text on an English page without lang", () => {
    const findings = langChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<html lang="en"><p>Bienvenue à Paris</p></html>);`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.checkId).toBe("lang-change");
  });

  it("accepts foreign text wrapped with lang", () => {
    expect(
      langChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<html lang="en"><p lang="fr">Bienvenue à Paris</p></html>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags Cyrillic text without lang on a French page", () => {
    const findings = langChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<html lang="fr"><p>Привет</p></html>);`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("skips script-mismatch detection when no lang is declared", () => {
    expect(
      langChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<html><p>Bienvenue à Paris</p></html>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});
