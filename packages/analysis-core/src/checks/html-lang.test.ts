import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { htmlLangCheck } from "./html-lang";

describe("html-lang", () => {
  it("flags <html> without lang", () => {
    const findings = htmlLangCheck.run(
      parseSource("test.tsx", `const L = () => <html><body>x</body></html>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "lang", value: "en" });
  });

  it("accepts <html lang>", () => {
    expect(
      htmlLangCheck.run(
        parseSource("test.tsx", `const L = () => <html lang="fr"><body>x</body></html>;`),
      ),
    ).toHaveLength(0);
  });
});
