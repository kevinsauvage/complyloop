import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse";
import {
  accessibleAuthCheck,
  accessibleAuthEnhancedCheck,
  autocompletePurposeCheck,
  captchaAlternativeCheck,
  errorPreventionCheck,
  fieldGroupingCheck,
  fieldsetLegendCheck,
  formErrorAssociationCheck,
  inputLabelCheck,
  optgroupCheck,
  redundantEntryCheck,
} from "./forms";

function run(jsx: string, filePath = "ContactForm.tsx") {
  return formErrorAssociationCheck.run(parseSource(filePath, jsx));
}

function violationsOf(jsx: string) {
  return run(jsx).filter((finding) => finding.kind === "violation");
}

function warningsOf(jsx: string) {
  return run(jsx).filter((finding) => finding.kind === "warning");
}

describe("input-label", () => {
  it("flags an input with no label association", () => {
    const findings = inputLabelCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <input type="email" name="work-email" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({
      attribute: "aria-label",
      value: "Work email",
    });
  });

  it("accepts aria-label, same-file <label htmlFor>, and exempt types", () => {
    const source = `const A = () => (<form>
      <input type="search" aria-label="Search products" />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      <input type="hidden" name="token" />
      <input type="submit" />
    </form>);`;
    expect(inputLabelCheck.run(parseSource("test.tsx", source))).toHaveLength(
      0,
    );
  });

  it("flags unlabeled select and textarea", () => {
    expect(
      inputLabelCheck.run(
        parseSource("test.tsx", `const A = () => <select name="country" />;`),
      ),
    ).toHaveLength(1);
    expect(
      inputLabelCheck.run(
        parseSource("test.tsx", `const A = () => <textarea name="bio" />;`),
      ),
    ).toHaveLength(1);
  });
});

describe("form-error-association", () => {
  describe("aria-invalid without aria-describedby (violations)", () => {
    it('flags aria-invalid="true"', () => {
      const findings = violationsOf(
        `const A = () => <input aria-invalid="true" />;`,
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        checkId: "form-error-association",
        severity: "serious",
        confidence: "medium",
      });
      expect(findings[0]?.reason).toContain("aria-describedby");
    });

    it("flags aria-invalid={true}", () => {
      expect(
        violationsOf(`const A = () => <input aria-invalid={true} />;`),
      ).toHaveLength(1);
    });

    it("flags boolean shorthand aria-invalid", () => {
      expect(
        violationsOf(`const A = () => <input aria-invalid />;`),
      ).toHaveLength(1);
    });

    it("flags dynamic aria-invalid expressions (conservative)", () => {
      expect(
        violationsOf(
          `const A = () => <input aria-invalid={!!errors.email} />;`,
        ),
      ).toHaveLength(1);
    });

    it("flags select and textarea", () => {
      expect(
        violationsOf(`const A = () => <select aria-invalid="true" />;`),
      ).toHaveLength(1);
      expect(
        violationsOf(`const A = () => <textarea aria-invalid="true" />;`),
      ).toHaveLength(1);
    });

    it('does not flag aria-invalid="false"', () => {
      expect(
        violationsOf(`const A = () => <input aria-invalid="false" />;`),
      ).toHaveLength(0);
    });

    it("does not flag aria-invalid={false}", () => {
      expect(
        violationsOf(`const A = () => <input aria-invalid={false} />;`),
      ).toHaveLength(0);
    });

    it("does not flag controls without aria-invalid", () => {
      expect(
        violationsOf(`const A = () => <input name="email" />;`),
      ).toHaveLength(0);
    });

    it("does not flag when aria-describedby is present (even if empty-looking)", () => {
      expect(
        violationsOf(
          `const A = () => <input aria-invalid="true" aria-describedby="email-error" />;`,
        ),
      ).toHaveLength(0);
    });

    it("does not flag prop-spreading design-system hosts", () => {
      expect(
        violationsOf(
          `const Input = (p) => <input aria-invalid="true" {...p} />;`,
        ),
      ).toHaveLength(0);
    });
  });

  describe("error message ids without aria-describedby reference (warnings)", () => {
    it("flags an unreferenced id containing 'error'", () => {
      const findings = warningsOf(`const A = () => (<form>
        <input name="email" />
        <p id="email-error">Required</p>
      </form>);`);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        severity: "moderate",
        confidence: "low",
      });
      expect(findings[0]?.reason).toContain('id="email-error"');
    });

    it("flags Error in the id case-insensitively", () => {
      expect(
        warningsOf(`const A = () => <span id="fieldError">x</span>;`),
      ).toHaveLength(1);
    });

    it("does not flag ids that do not look like errors", () => {
      expect(
        warningsOf(`const A = () => <p id="email-help">Hint</p>;`),
      ).toHaveLength(0);
    });

    it("does not flag when statically referenced", () => {
      expect(
        warningsOf(`const A = () => (<form>
          <input aria-describedby="email-error" />
          <p id="email-error">Required</p>
        </form>);`),
      ).toHaveLength(0);
    });

    it("does not flag when referenced via JSX expression string", () => {
      expect(
        warningsOf(`const A = () => (<form>
          <input aria-describedby={"email-error"} />
          <p id="email-error">Required</p>
        </form>);`),
      ).toHaveLength(0);
    });

    it("accepts space-separated aria-describedby lists", () => {
      expect(
        warningsOf(`const A = () => (<form>
          <input aria-describedby="hint email-error" />
          <p id="hint">Hint</p>
          <p id="email-error">Required</p>
        </form>);`),
      ).toHaveLength(0);
    });
  });

  describe("conditional / dynamic aria-describedby (regression: ContactForm false positives)", () => {
    it("accepts ternary aria-describedby referencing the error id", () => {
      expect(
        run(`const A = () => (<form>
          <input
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
        </form>);`),
      ).toHaveLength(0);
    });

    it("accepts && short-circuit aria-describedby", () => {
      expect(
        run(`const A = () => (<form>
          <input
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name && "name-error"}
          />
          {errors.name && <p id="name-error">{errors.name.message}</p>}
        </form>);`),
      ).toHaveLength(0);
    });

    it("accepts nullish coalescing fallbacks that include the error id", () => {
      expect(
        run(`const A = () => (<form>
          <input aria-describedby={errors.email ? "email-error" : "email-hint"} />
          <p id="email-error">Required</p>
          <p id="email-hint">Hint</p>
        </form>);`),
      ).toHaveLength(0);
    });

    it("accepts a ContactForm-shaped form with three conditionally associated fields", () => {
      const findings = run(`export function ContactForm() {
        return (
          <form>
            <input
              name="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name ? <p id="name-error">{errors.name.message}</p> : null}
            <input
              name="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
            <textarea
              name="message"
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? "message-error" : undefined}
            />
            {errors.message ? <p id="message-error">{errors.message.message}</p> : null}
          </form>
        );
      }`);
      expect(findings).toHaveLength(0);
    });

    it("flags a ContactForm-shaped form when error ids are never described", () => {
      const findings = run(`export function ContactForm() {
        return (
          <form>
            <input name="name" />
            {errors.name ? <p id="name-error">{errors.name.message}</p> : null}
            <input name="email" />
            {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
            <textarea name="message" />
            {errors.message ? <p id="message-error">{errors.message.message}</p> : null}
          </form>
        );
      }`);
      const warnings = findings.filter((finding) => finding.kind === "warning");
      expect(warnings).toHaveLength(3);
      expect(warnings.map((finding) => finding.reason)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('id="name-error"'),
          expect.stringContaining('id="email-error"'),
          expect.stringContaining('id="message-error"'),
        ]),
      );
    });

    it("flags aria-invalid inputs that omit aria-describedby even when error nodes exist", () => {
      const findings = run(`const A = () => (<form>
        <input aria-invalid={!!errors.email} />
        <p id="email-error">Required</p>
      </form>);`);
      expect(findings.filter((f) => f.kind === "violation")).toHaveLength(1);
      expect(findings.filter((f) => f.kind === "warning")).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("does not treat a fully dynamic aria-describedby as referencing a concrete error id", () => {
      // Expression has no string literal — orphan error id still warns.
      const warnings = warningsOf(`const A = () => (<form>
        <input aria-describedby={describedById} />
        <p id="email-error">Required</p>
      </form>);`);
      expect(warnings).toHaveLength(1);
    });

    it("extracts ids from template literals without substitutions", () => {
      expect(
        warningsOf(`const A = () => (<form>
          <input aria-describedby={\`email-error\`} />
          <p id="email-error">Required</p>
        </form>);`),
      ).toHaveLength(0);
    });

    it("returns empty findings for a clean form with no invalid markers", () => {
      expect(
        run(`const A = () => (<form>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" />
          <button type="submit">Send</button>
        </form>);`),
      ).toHaveLength(0);
    });
  });
});

describe("field-grouping", () => {
  it("flags related checkbox groups outside fieldsets", () => {
    const findings = fieldGroupingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <div>
            <input type="checkbox" name="interests" value="a11y" />
            <input type="checkbox" name="interests" value="security" />
          </div>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags identity autocomplete pairs without grouping", () => {
    const findings = fieldGroupingCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <>
            <input autocomplete="given-name" />
            <input autocomplete="family-name" />
          </>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toMatch(/group/i);
  });

  it("accepts related fields grouped in a fieldset", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <fieldset>
              <legend>Identity</legend>
              <input autocomplete="given-name" />
              <input autocomplete="family-name" />
            </fieldset>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("fieldset-legend", () => {
  it("flags a fieldset without a legend", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <fieldset><input type="radio" name="x" /></fieldset>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags radio groups that are not wrapped in a fieldset", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <input type="radio" name="plan" value="a" />
              <input type="radio" name="plan" value="b" />
            </div>
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a fieldset with a legend and grouped radios", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <fieldset>
              <legend>Plan</legend>
              <input type="radio" name="plan" value="a" />
              <input type="radio" name="plan" value="b" />
            </fieldset>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("optgroup", () => {
  it("flags an optgroup without a label", () => {
    const findings = optgroupCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <select>
            <optgroup>
              <option>One</option>
            </optgroup>
          </select>
        );`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("optgroup");
  });

  it("accepts an optgroup with a label", () => {
    expect(
      optgroupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <select>
              <optgroup label="Fruit">
                <option>Apple</option>
              </optgroup>
            </select>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("autocomplete-purpose", () => {
  it("flags an email field without autocomplete", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="email" id="e" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts identity fields that declare autocomplete", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="email" autoComplete="email" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-identity fields", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="search" aria-label="Search" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("error-prevention", () => {
  it("warns when a checkout form submits without a confirm step", () => {
    const findings = errorPreventionCheck.run(
      parseSource(
        "checkout.tsx",
        `const Checkout = () => (
          <form action="/pay">
            <input name="card" />
            <button type="submit">Place order</button>
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });

  it("accepts a confirm button before final submit", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const Checkout = () => (
            <form action="/pay">
              <input name="card" />
              <button type="button">Review order</button>
              <button type="submit">Confirm payment</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a terms agreement checkbox", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "legal.tsx",
          `const Legal = () => (
            <form>
              <label><input type="checkbox" /> I agree to the terms</label>
              <button type="submit">Submit contract</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a submit button labeled Confirm payment", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const Checkout = () => (
            <form action="/pay">
              <input name="card" />
              <button type="submit">Confirm payment</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on a French payment form without safeguard", () => {
    const findings = errorPreventionCheck.run(
      parseSource(
        "paiement.tsx",
        `const Paiement = () => (
          <form action="/paiement">
            <input name="carte" />
            <button type="submit">Payer</button>
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });

  it("accepts a French review step before submit", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "paiement.tsx",
          `const Paiement = () => (
            <form action="/paiement">
              <button type="button">Vérifier la commande</button>
              <button type="submit">Confirmer le paiement</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("does not treat a dynamic-typed button as the submit in a high-risk component", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const Checkout = () => (
            <div>
              <p>Your payment is being processed.</p>
              <button type={ctaType}>Place order</button>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("still warns when an attribute-less button is the only submit button", () => {
    const findings = errorPreventionCheck.run(
      parseSource(
        "checkout.tsx",
        `const Checkout = () => (
          <div>
            <p>Your payment is being processed.</p>
            <button>Place order</button>
          </div>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });
});

describe("redundant-entry", () => {
  it("warns when the same identity field appears twice", () => {
    const findings = redundantEntryCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (
          <form>
            <input type="email" name="email" autoComplete="email" aria-label="Email" />
            <input type="email" name="email" autoComplete="email" aria-label="Confirm email" />
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "redundant-entry")).toBe(true);
  });

  it("accepts duplicate fields when a hidden carry-over exists", () => {
    expect(
      redundantEntryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <form>
              <input type="hidden" name="email" value="a@b.co" />
              <input type="email" name="email" autoComplete="email" aria-label="Email" />
              <input type="email" name="email" autoComplete="email" aria-label="Email again" />
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("accessible-auth", () => {
  it("flags password field with autocomplete off", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="password" autoComplete="off" aria-label="Password" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags paste blocking on login field", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <input
              type="password"
              autoComplete="current-password"
              onPaste={(e) => e.preventDefault()}
              aria-label="Password"
            />
          );`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts standard password autocomplete", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="password" autoComplete="current-password" aria-label="Password" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

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
    expect(findings.some((f) => f.checkId === "accessible-auth-enhanced")).toBe(
      true,
    );
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
    expect(findings.some((f) => f.checkId === "accessible-auth-enhanced")).toBe(
      true,
    );
  });

  it("flags PuzzleCaptcha host near auth fields", () => {
    const findings = accessibleAuthEnhancedCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => (
          <form>
            <input type="password" autoComplete="current-password" />
            <PuzzleCaptcha />
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "accessible-auth-enhanced")).toBe(
      true,
    );
  });

  it("flags ReCAPTCHA with size near auth fields", () => {
    const findings = accessibleAuthEnhancedCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => (
          <form>
            <input type="password" autoComplete="current-password" />
            <ReCAPTCHA sitekey="x" size="normal" />
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "accessible-auth-enhanced")).toBe(
      true,
    );
  });

  it("does not flag ReCAPTCHA without size/challenge near auth", () => {
    expect(
      accessibleAuthEnhancedCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => (
            <form>
              <input type="password" autoComplete="current-password" />
              <ReCAPTCHA sitekey="x" />
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
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

describe("captcha-alternative", () => {
  it("flags captcha hosts without an alternative", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource("login.tsx", `const L = () => <ReCAPTCHA sitekey="x" />;`),
    );
    expect(findings.some((f) => f.checkId === "captcha-alternative")).toBe(
      true,
    );
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

describe("input-label coverage", () => {
  it("does not flag a prop-spreading input host (labels live at call sites)", () => {
    expect(
      inputLabelCheck.run(
        parseSource("test.tsx", `const A = (props) => <input {...props} />;`),
      ),
    ).toHaveLength(0);
  });
});

describe("form-error-association coverage", () => {
  it("collects string literals inside template-expression substitutions", () => {
    const src =
      "const A = () => (<form>\n" +
      '  <input aria-describedby={`prefix ${"email-error"}`} />\n' +
      '  <p id="email-error">Required</p>\n' +
      "</form>);";
    expect(run(src)).toHaveLength(0);
  });
});

describe("field-grouping coverage", () => {
  it("ignores a top-level autocomplete input with no JSX parent", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input autoComplete="given-name" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-identity autocomplete tokens", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input autoComplete="email" /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a single checkbox with no pair", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input type="checkbox" name="interests" value="a" /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts adjacent identity tokens that are not a pair", () => {
    expect(
      fieldGroupingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input autoComplete="given-name" /><input autoComplete="address-line1" /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("fieldset-legend coverage", () => {
  it("accepts a fieldset with an aria-label", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<fieldset aria-label="Plan"><input type="radio" name="x" /></fieldset>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags a self-closing fieldset without a legend", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource("test.tsx", `const A = () => <fieldset />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts a fieldset whose legend carries an accessible name", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<fieldset><legend aria-label="Plan"></legend></fieldset>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags a fieldset with only a non-legend child", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<fieldset><div>hi</div></fieldset>);`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores non-radio inputs and nameless radios", () => {
    expect(
      fieldsetLegendCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input type="text" name="x" /><input type="radio" /></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("optgroup coverage", () => {
  it("does not flag a prop-spreading optgroup host", () => {
    expect(
      optgroupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<select><optgroup {...props}><option>One</option></optgroup></select>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts an optgroup with an aria-label", () => {
    expect(
      optgroupCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<select><optgroup aria-label="Fruit"><option>Apple</option></optgroup></select>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("autocomplete-purpose coverage", () => {
  it("ignores non-input hosts", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <select aria-label="Country" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores text inputs without an identity name", () => {
    expect(
      autocompletePurposeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="text" aria-label="Nickname" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("error-prevention coverage", () => {
  it("warns on a self-closing high-risk form", () => {
    const findings = errorPreventionCheck.run(
      parseSource("checkout.tsx", `const C = () => <form action="/pay" />;`),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });

  it("warns when a type=button control is not a safeguard", () => {
    const findings = errorPreventionCheck.run(
      parseSource(
        "checkout.tsx",
        `const C = () => (
          <form action="/pay">
            <input name="card" />
            <button type="button">Click me</button>
            <button type="submit">Place order</button>
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });

  it("accepts a form with a confirm data attribute", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const C = () => (
            <form action="/pay" data-confirm="true">
              <input name="card" />
              <button type="submit">Place order</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a form whose checkbox carries its agreement text via aria-label", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const C = () => (
            <form action="/pay">
              <input type="checkbox" aria-label="I agree to the terms" />
              <button type="submit">Place order</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a high-risk form whose onSubmit calls confirm", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const C = () => (
            <form action="/pay" onSubmit={() => confirm("Sure?")}>
              <input name="card" />
              <button type="submit">Place order</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on a high-risk form with an empty onSubmit expression", () => {
    const findings = errorPreventionCheck.run(
      parseSource(
        "checkout.tsx",
        `const C = () => (
          <form action="/pay" onSubmit={}>
            <input name="card" />
            <button type="submit">Place order</button>
          </form>
        );`,
      ),
    );
    expect(findings.some((f) => f.checkId === "error-prevention")).toBe(true);
  });

  it("ignores a low-risk form", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "contact.tsx",
          `const C = () => (
            <form action="/contact">
              <input name="email" />
              <button type="submit">Send</button>
            </form>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores components without high-risk text", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><p>Hello world</p></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a high-risk component with a review safeguard", () => {
    expect(
      errorPreventionCheck.run(
        parseSource(
          "checkout.tsx",
          `const C = () => (
            <div>
              <p>Your payment is due</p>
              <button>Review order</button>
              <button>Place order</button>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("redundant-entry coverage", () => {
  it("accepts a single identity field", () => {
    expect(
      redundantEntryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<form><input type="email" name="email" autoComplete="email" aria-label="Email" /></form>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on name-derived identity keys matching the loose pattern", () => {
    const findings = redundantEntryCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<form><input type="text" name="user-email" aria-label="Email" /><input type="text" name="user-email" aria-label="Email again" /></form>);`,
      ),
    );
    expect(findings.some((f) => f.checkId === "redundant-entry")).toBe(true);
  });

  it("ignores inputs without a name or id and names outside the identity pattern", () => {
    expect(
      redundantEntryCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<form><input type="text" aria-label="A" /><input type="text" name="city" aria-label="B" /></form>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on exact identity names without autocomplete tokens", () => {
    const findings = redundantEntryCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<form><input type="text" name="email" aria-label="Email" /><input type="text" name="email" aria-label="Email again" /></form>);`,
      ),
    );
    expect(findings.some((f) => f.checkId === "redundant-entry")).toBe(true);
  });
});

describe("accessible-auth coverage", () => {
  it("ignores non-authentication fields", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="text" aria-label="Name" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores an empty onPaste expression (no paste blocking)", () => {
    expect(
      accessibleAuthCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input type="password" autoComplete="current-password" onPaste={} aria-label="Password" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on a read-only auth field with a manager autocomplete token", () => {
    const findings = accessibleAuthCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <input type="password" autoComplete="current-password" readOnly aria-label="Password" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });
});

describe("captcha-alternative coverage", () => {
  it("flags a captcha host with a non-alternative child", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => <ReCAPTCHA sitekey="x"><div>hello</div></ReCAPTCHA>;`,
      ),
    );
    expect(findings.some((f) => f.checkId === "captcha-alternative")).toBe(
      true,
    );
  });

  it("accepts a captcha host with a nested audio-challenge button", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => <ReCAPTCHA sitekey="x"><button type="button">Audio challenge</button></ReCAPTCHA>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a captcha host with a nested audio element", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => <ReCAPTCHA sitekey="x"><audio src="captcha.mp3" /></ReCAPTCHA>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a captcha host with an audioCaptcha attribute", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => <ReCAPTCHA sitekey="x" audioCaptcha="true"><div>hi</div></ReCAPTCHA>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts a captcha whose sibling subtree holds the alternative", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const L = () => (<div><ReCAPTCHA sitekey="x" /><div><button type="button">Audio challenge</button></div></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags a captcha with a non-alternative sibling", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => (<div><ReCAPTCHA sitekey="x" /><span>hi</span></div>);`,
      ),
    );
    expect(findings.some((f) => f.checkId === "captcha-alternative")).toBe(
      true,
    );
  });

  it("ignores a plain image", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <img alt="logo" src="logo.png" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags a standalone image captcha without an alternative", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource(
        "login.tsx",
        `const A = () => <img alt="captcha image" src="captcha.png" />;`,
      ),
    );
    expect(
      findings.some(
        (f) => f.checkId === "captcha-alternative" && f.kind === "warning",
      ),
    ).toBe(true);
  });

  it("accepts an image captcha with a sibling audio alternative", () => {
    expect(
      captchaAlternativeCheck.run(
        parseSource(
          "login.tsx",
          `const A = () => (<div><img alt="captcha" src="c.png" /><button type="button">Audio challenge</button></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("links an image captcha to its captcha ancestor host", () => {
    const findings = captchaAlternativeCheck.run(
      parseSource(
        "login.tsx",
        `const L = () => <ReCAPTCHA sitekey="x"><img alt="captcha image" src="c.png" /></ReCAPTCHA>;`,
      ),
    );
    expect(
      findings.filter((f) => f.checkId === "captcha-alternative"),
    ).toHaveLength(2);
  });
});
