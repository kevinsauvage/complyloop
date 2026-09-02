import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { accessibleAuthEnhancedCheck } from "./accessible-auth-enhanced";

describe("accessible-auth-enhanced", () => {
  it("flags image-challenge captcha near auth fields", () => {
    const findings = accessibleAuthEnhancedCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => (
          <form>
            <input type="password" autoComplete="current-password" />
            <div aria-label="Select all traffic lights">Pick images</div>
          </form>
        );`,
      ),
    );
    expect(
      findings.some((f) => f.checkId === "accessible-auth-enhanced"),
    ).toBe(true);
  });

  it("flags French image-challenge captcha near auth fields", () => {
    const findings = accessibleAuthEnhancedCheck.run(
      parseSource(
        "connexion.tsx",
        `const L = () => (
          <form>
            <input type="password" autoComplete="current-password" />
            <div aria-label="Sélectionnez tous les feux tricolores">Images</div>
          </form>
        );`,
      ),
    );
    expect(
      findings.some((f) => f.checkId === "accessible-auth-enhanced"),
    ).toBe(true);
  });

  it("does not flag checkbox captcha without puzzle cues", () => {
    expect(
      accessibleAuthEnhancedCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => (
            <form>
              <input type="password" autoComplete="current-password" />
              <Turnstile sitekey="x" />
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores captcha outside authentication context", () => {
    expect(
      accessibleAuthEnhancedCheck.run(
        parseSource(
          "newsletter.tsx",
          `const N = () => <div aria-label="Select all buses">Verify</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
