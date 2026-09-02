import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { formErrorAssociationCheck } from "./form-error-association";

function run(jsx: string, filePath = "ContactForm.tsx") {
  return formErrorAssociationCheck.run(parseSource(filePath, jsx));
}

function violationsOf(jsx: string) {
  return run(jsx).filter((finding) => finding.kind === "violation");
}

function warningsOf(jsx: string) {
  return run(jsx).filter((finding) => finding.kind === "warning");
}

describe("form-error-association", () => {
  describe("aria-invalid without aria-describedby (violations)", () => {
    it("flags aria-invalid=\"true\"", () => {
      const findings = violationsOf(`const A = () => <input aria-invalid="true" />;`);
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
      expect(violationsOf(`const A = () => <input aria-invalid />;`)).toHaveLength(
        1,
      );
    });

    it("flags dynamic aria-invalid expressions (conservative)", () => {
      expect(
        violationsOf(`const A = () => <input aria-invalid={!!errors.email} />;`),
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

    it("does not flag aria-invalid=\"false\"", () => {
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
      expect(violationsOf(`const A = () => <input name="email" />;`)).toHaveLength(
        0,
      );
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
