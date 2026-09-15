import { describe, expect, it } from "vitest";

import {
  AGREE_LABEL,
  AUTH_CONTEXT,
  CAPTCHA_ALTERNATIVE,
  CONFIRM_LABEL,
  foldAccents,
  HIGH_RISK,
  matchesMultilingual,
  PUZZLE_CAPTCHA,
  VAGUE_LINK_TEXT,
} from "./multilingual";

describe("multilingual patterns", () => {
  it("folds accented characters for word-boundary matching", () => {
    expect(foldAccents("Écouter")).toBe("Ecouter");
  });

  it("matches patterns after accent folding", () => {
    expect(matchesMultilingual(/\bconfirmer\b/i, "Confirmer le paiement")).toBe(
      true,
    );
    expect(matchesMultilingual(CAPTCHA_ALTERNATIVE, "Écouter le captcha")).toBe(
      true,
    );
  });

  it("detects French high-risk checkout context", () => {
    expect(HIGH_RISK.test("formulaire de paiement")).toBe(true);
    expect(HIGH_RISK.test("valider la commande")).toBe(true);
  });

  it("detects French confirm and agree safeguards", () => {
    expect(CONFIRM_LABEL.test("Vérifier la commande")).toBe(true);
    expect(AGREE_LABEL.test("J'accepte les conditions générales")).toBe(true);
  });

  it("detects French captcha alternatives and auth context", () => {
    expect(matchesMultilingual(CAPTCHA_ALTERNATIVE, "Écouter le captcha")).toBe(
      true,
    );
    expect(matchesMultilingual(AUTH_CONTEXT, "Mot de passe")).toBe(true);
  });

  it("detects French puzzle captcha cues", () => {
    expect(PUZZLE_CAPTCHA.test("Sélectionnez tous les feux tricolores")).toBe(
      true,
    );
  });

  it("detects French vague link text", () => {
    expect(VAGUE_LINK_TEXT.test("cliquez ici")).toBe(true);
    expect(VAGUE_LINK_TEXT.test("en savoir plus")).toBe(true);
  });
});
