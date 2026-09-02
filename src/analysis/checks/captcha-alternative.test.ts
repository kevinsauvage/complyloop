import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { captchaAlternativeCheck } from "./captcha-alternative";

describe("captcha-alternative", () => {
  it("flags captcha hosts without an alternative", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource("login.tsx", `const L = () => <ReCAPTCHA sitekey="x" />;`),
    );
    expect(findings.some((f) => f.checkId === "captcha-alternative")).toBe(true);
  });

  it("accepts captcha with an audio alternative link", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => (
            <div>
              <ReCAPTCHA sitekey="x" />
              <button type="button">Audio challenge</button>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts captcha with a French audio alternative", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => (
            <div>
              <ReCAPTCHA sitekey="x" />
              <button type="button">Écouter le captcha</button>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});
