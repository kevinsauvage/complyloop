import { describe, expect, it } from "vitest";

import { isObjectRecognitionCaptchaSignal } from "./object-recognition-captcha";

describe("isObjectRecognitionCaptchaSignal", () => {
  it("flags PUZZLE_HOSTS by tag name", () => {
    expect(
      isObjectRecognitionCaptchaSignal({
        tagName: "PuzzleCaptcha",
        contextText: "PuzzleCaptcha",
        hasSizeOrChallengeAttr: false,
      }),
    ).toBe(true);
  });

  it("flags puzzle phrase in context", () => {
    expect(
      isObjectRecognitionCaptchaSignal({
        tagName: "div",
        contextText: "Select all traffic lights",
        hasSizeOrChallengeAttr: false,
      }),
    ).toBe(true);
  });

  it("flags challenge provider only when size/challenge is present", () => {
    expect(
      isObjectRecognitionCaptchaSignal({
        tagName: "ReCAPTCHA",
        contextText: "ReCAPTCHA sitekey",
        hasSizeOrChallengeAttr: false,
      }),
    ).toBe(false);
    expect(
      isObjectRecognitionCaptchaSignal({
        tagName: "ReCAPTCHA",
        contextText: "ReCAPTCHA sitekey",
        hasSizeOrChallengeAttr: true,
      }),
    ).toBe(true);
  });

  it("does not flag checkbox-style hosts without puzzle cues", () => {
    expect(
      isObjectRecognitionCaptchaSignal({
        tagName: "Turnstile",
        contextText: "Turnstile sitekey",
        hasSizeOrChallengeAttr: false,
      }),
    ).toBe(false);
  });
});
