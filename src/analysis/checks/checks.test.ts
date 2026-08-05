import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { anchorNameCheck } from "./anchor-name";
import { buttonNameCheck } from "./button-name";
import { htmlLangCheck } from "./html-lang";
import { imgAltCheck } from "./img-alt";
import { inputLabelCheck } from "./input-label";
import { autoplayMediaCheck } from "./autoplay-media";
import { emptyHeadingCheck } from "./empty-heading";
import { headingOrderCheck } from "./heading-order";
import { iframeTitleCheck } from "./iframe-title";
import { positiveTabindexCheck } from "./positive-tabindex";
import type { AccessibilityCheck } from "../types";

function run(check: AccessibilityCheck, jsx: string) {
  return check.run(parseSource("test.tsx", jsx));
}

describe("img-alt", () => {
  it("flags an <img> without alt as a violation with an editable fix", () => {
    const findings = run(imgAltCheck, `const A = () => <img src="/hero-banner.png" />;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("violation");
    expect(findings[0].fix).toMatchObject({
      kind: "insert_attribute",
      attribute: "alt",
      value: "Hero banner",
      editable: true,
    });
  });

  it("flags generic alt text as a warning without a fix", () => {
    const findings = run(imgAltCheck, `const A = () => <img src="/x.png" alt="image" />;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("warning");
    expect(findings[0].fix).toBeNull();
  });

  it("accepts descriptive alt text and empty (decorative) alt", () => {
    const source = `const A = () => (<div><img src="/x.png" alt="Team photo at the 2026 offsite" /><img src="/border.png" alt="" /></div>);`;
    expect(run(imgAltCheck, source)).toHaveLength(0);
  });
});

describe("button-name", () => {
  it("flags an icon-only button", () => {
    const findings = run(buttonNameCheck, `const A = () => <button><svg /></button>;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("accepts text content, aria-label, and expression children", () => {
    const source = `const A = () => (<div>
      <button>Save</button>
      <button aria-label="Close dialog"><svg /></button>
      <button>{label}</button>
    </div>);`;
    expect(run(buttonNameCheck, source)).toHaveLength(0);
  });
});

describe("anchor-name", () => {
  it("flags an icon-only link with href", () => {
    const findings = run(anchorNameCheck, `const A = () => <a href="/cart"><svg /></a>;`);
    expect(findings).toHaveLength(1);
  });

  it("accepts links named by text or an image alt", () => {
    const source = `const A = () => (<div>
      <a href="/">Home</a>
      <a href="/x"><img src="/logo.png" alt="Acme home" /></a>
    </div>);`;
    expect(run(anchorNameCheck, source)).toHaveLength(0);
  });
});

describe("html-lang", () => {
  it("flags <html> without lang", () => {
    const findings = run(htmlLangCheck, `const L = () => <html><body>x</body></html>;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "lang", value: "en" });
  });

  it("accepts <html lang>", () => {
    expect(run(htmlLangCheck, `const L = () => <html lang="fr"><body>x</body></html>;`)).toHaveLength(0);
  });
});

describe("positive-tabindex", () => {
  it("flags tabIndex greater than zero with a replacement fix", () => {
    const findings = run(positiveTabindexCheck, `const A = () => <input tabIndex={3} aria-label="x" />;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({
      kind: "replace_attribute_value",
      replacementText: "{0}",
    });
  });

  it("accepts tabIndex of 0 and -1", () => {
    const source = `const A = () => (<div><div tabIndex={0} /><div tabIndex={-1} /></div>);`;
    expect(run(positiveTabindexCheck, source)).toHaveLength(0);
  });
});

describe("input-label", () => {
  it("flags an input with no label association", () => {
    const findings = run(inputLabelCheck, `const A = () => <input type="email" name="work-email" />;`);
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "aria-label", value: "Work email" });
  });

  it("accepts aria-label, same-file <label htmlFor>, and exempt types", () => {
    const source = `const A = () => (<form>
      <input type="search" aria-label="Search products" />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      <input type="hidden" name="token" />
      <input type="submit" />
    </form>);`;
    expect(run(inputLabelCheck, source)).toHaveLength(0);
  });
});

describe("heading-order", () => {
  it("flags skipped heading levels", () => {
    const findings = run(
      headingOrderCheck,
      `const A = () => (<div><h1>Title</h1><h3>Skip</h3></div>);`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("heading-order");
  });
});

describe("empty-heading", () => {
  it("flags headings with no text", () => {
    const findings = run(emptyHeadingCheck, `const A = () => <h2></h2>;`);
    expect(findings).toHaveLength(1);
  });
});

describe("iframe-title", () => {
  it("flags iframe without title and suggests a fix", () => {
    const findings = run(
      iframeTitleCheck,
      `const A = () => <iframe src="https://example.com" />;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "title" });
  });
});

describe("autoplay-media", () => {
  it("flags video with autoPlay", () => {
    const findings = run(
      autoplayMediaCheck,
      `const A = () => <video src="/x.mp4" autoPlay />;`,
    );
    expect(findings).toHaveLength(1);
  });
});

