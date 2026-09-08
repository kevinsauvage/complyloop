import { afterEach, describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN,
  CAPTCHA_WITH_CHALLENGE,
  PUZZLE_CAPTCHA,
  matchesMultilingual,
} from "../../patterns/multilingual";
import { PUZZLE_HOST_NAMES } from "../../patterns/object-recognition-captcha";
import {
  collectCaptchaCandidates,
  elementLooksLikeCaptcha,
  isObjectRecognitionCaptchaElement,
} from "./captcha-candidates";

describe("captcha-candidates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collects recaptcha and puzzle host candidates", () => {
    document.body.innerHTML = `
      <div class="g-recaptcha" data-sitekey="x"></div>
      <puzzlecaptcha></puzzlecaptcha>
      <p>plain</p>
    `;
    const candidates = collectCaptchaCandidates(document);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(
      candidates.some((el) => el.classList.contains("g-recaptcha")),
    ).toBe(true);
    expect(
      candidates.some((el) => el.tagName.toLowerCase() === "puzzlecaptcha"),
    ).toBe(true);
  });

  it("elementLooksLikeCaptcha matches CAPTCHA_TOKEN on class/html", () => {
    document.body.innerHTML = `<div class="g-recaptcha" data-sitekey="x"></div>`;
    const el = document.querySelector(".g-recaptcha")!;
    expect(elementLooksLikeCaptcha(el, matchesMultilingual, CAPTCHA_TOKEN)).toBe(
      true,
    );
  });

  it("isObjectRecognitionCaptchaElement aligns with shared signal criteria", () => {
    document.body.innerHTML = `
      <div id="checkbox" class="g-recaptcha" data-sitekey="x"></div>
      <div id="image" class="g-recaptcha" data-sitekey="x" data-size="normal"></div>
      <iframe id="puzzle" title="Select all traffic lights"></iframe>
      <puzzlecaptcha id="host"></puzzlecaptcha>
    `;

    const check = (id: string) =>
      isObjectRecognitionCaptchaElement(
        document.getElementById(id)!,
        matchesMultilingual,
        PUZZLE_CAPTCHA,
        CAPTCHA_WITH_CHALLENGE,
        PUZZLE_HOST_NAMES,
      );

    expect(check("checkbox")).toBe(false);
    expect(check("image")).toBe(true);
    expect(check("puzzle")).toBe(true);
    expect(check("host")).toBe(true);
  });
});
