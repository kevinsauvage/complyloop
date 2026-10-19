import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse.ts";
import type { AccessibilityCheck } from "../../types.ts";
import { newWindowOnloadCheck } from "./behavior.ts";
import {
  captchaAlternativeCheck,
  formErrorAssociationCheck,
  inputLabelCheck,
} from "./forms.ts";
import { headingOrderCheck, listStructureCheck } from "./structure.ts";

/**
 * Regressions from auditing a real Next.js portfolio: each case is a pattern
 * the project's own markup got right but the heuristics used to flag.
 */
function run(check: AccessibilityCheck, code: string) {
  return check.run(parseSource("fixture.tsx", code));
}

describe("heading-order", () => {
  it("uses the level named by a literal `as` prop, not the component name", () => {
    expect(
      run(
        headingOrderCheck,
        `const A = () => <><h1>Title</h1><H3 as="h2">Section</H3></>;`,
      ),
    ).toHaveLength(0);
  });

  it("still flags a real skip, including through `as`", () => {
    expect(
      run(
        headingOrderCheck,
        `const A = () => <><h1>Title</h1><H2 as="h4">Section</H2></>;`,
      ),
    ).toHaveLength(1);
  });

  it("does not guess when `as` is dynamic", () => {
    expect(
      run(
        headingOrderCheck,
        `const A = () => <><h1>Title</h1><H3 as={level}>Section</H3></>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("list-structure", () => {
  it("does not judge an <li> whose parent is a custom component", () => {
    expect(
      run(
        listStructureCheck,
        `const A = () => <Group><li>One</li><li>Two</li></Group>;`,
      ),
    ).toHaveLength(0);
  });

  it("still flags an <li> inside a host element that is not a list", () => {
    expect(
      run(listStructureCheck, `const A = () => <div><li>One</li></div>;`),
    ).toHaveLength(1);
  });
});

describe("input-label", () => {
  it("pairs a template-literal id with a template-literal htmlFor", () => {
    expect(
      run(
        inputLabelCheck,
        'const A = () => <div><input id={`cookie-${name}`} type="checkbox" /><label htmlFor={`cookie-${name}`}>Title</label></div>;',
      ),
    ).toHaveLength(0);
  });

  it("still flags an input whose template id has no matching label", () => {
    expect(
      run(
        inputLabelCheck,
        "const A = () => <div><input id={`cookie-${name}`} /><label htmlFor={`other-${name}`}>Title</label></div>;",
      ),
    ).toHaveLength(1);
  });
});

describe("form-error-association", () => {
  it("ignores an error message that names no control in the file", () => {
    const findings = run(
      formErrorAssociationCheck,
      `const A = () => (<form>
        <input id="email" aria-describedby={e ? "email-error" : undefined} />
        {e && <FormError id="email-error" />}
        {captchaError && <FormError id="captcha-error" message={captchaError} />}
      </form>);`,
    );
    expect(findings).toHaveLength(0);
  });

  it("still flags an error message for a control that never references it", () => {
    const findings = run(
      formErrorAssociationCheck,
      `const A = () => (<form><input id="email" /><p id="email-error">Required</p></form>);`,
    );
    expect(findings).toHaveLength(1);
  });
});

describe("captcha-alternative", () => {
  it("does not treat a captcha error message as a CAPTCHA challenge", () => {
    expect(
      run(
        captchaAlternativeCheck,
        `const A = () => <form><input id="email" />{captchaError && <FormError id="captcha-error" message={captchaError} />}</form>;`,
      ),
    ).toHaveLength(0);
  });

  it("skips invisible reCAPTCHA v3 flows", () => {
    expect(
      run(
        captchaAlternativeCheck,
        `const A = () => { const t = await getRecaptchaToken(key, "contact"); return <div data-captcha="v3" />; };`,
      ),
    ).toHaveLength(0);
  });

  it("still flags a visible CAPTCHA component without an alternative", () => {
    expect(
      run(
        captchaAlternativeCheck,
        `const A = () => <ReCAPTCHA sitekey="x" />;`,
      ),
    ).toHaveLength(1);
  });
});

describe("new-window-onload", () => {
  it("accepts a link that references a shared new-tab hint", () => {
    expect(
      run(
        newWindowOnloadCheck,
        `const A = () => <a href="https://x.dev" target="_blank">Docs<NewTabHint /></a>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        newWindowOnloadCheck,
        'const A = () => <a href="https://x.dev" target="_blank" aria-label={`Docs (${NEW_TAB_LABEL})`}>Docs</a>;',
      ),
    ).toHaveLength(0);
  });

  it("still flags a _blank link with no warning at all", () => {
    expect(
      run(
        newWindowOnloadCheck,
        `const A = () => <a href="https://x.dev" target="_blank">Docs</a>;`,
      ),
    ).toHaveLength(1);
  });
});
