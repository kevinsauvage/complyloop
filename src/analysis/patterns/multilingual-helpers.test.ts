import { describe, expect, it } from "vitest";
import { CAPTCHA_ALTERNATIVE, foldAccents, matchesMultilingual } from "./multilingual";

describe("multilingual matching helpers", () => {
  it("folds accented characters for word-boundary matching", () => {
    expect(foldAccents("Écouter")).toBe("Ecouter");
  });

  it("matches patterns after accent folding", () => {
    expect(matchesMultilingual(/\bconfirmer\b/i, "Confirmer le paiement")).toBe(
      true,
    );
    expect(
      matchesMultilingual(CAPTCHA_ALTERNATIVE, "Écouter le captcha"),
    ).toBe(true);
  });
});
