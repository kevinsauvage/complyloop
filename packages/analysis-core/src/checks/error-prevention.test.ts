import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { errorPreventionCheck } from "./error-prevention";

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
