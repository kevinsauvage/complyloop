import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { anchorNameCheck } from "./anchor-name";
import { ariaHiddenFocusableCheck } from "./aria-hidden-focusable";
import { autocompleteValidCheck } from "./autocomplete-valid";
import { buttonNameCheck } from "./button-name";
import { duplicateIdCheck } from "./duplicate-id";
import { htmlLangCheck } from "./html-lang";
import { imgAltCheck } from "./img-alt";
import { inputLabelCheck } from "./input-label";
import { autoplayMediaCheck } from "./autoplay-media";
import { emptyHeadingCheck } from "./empty-heading";
import { headingOrderCheck } from "./heading-order";
import { iframeTitleCheck } from "./iframe-title";
import { listStructureCheck } from "./list-structure";
import { metaViewportCheck } from "./meta-viewport";
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
    expect(findings[0]?.fix).toMatchObject({
      kind: "insert_attribute",
      attribute: "aria-label",
    });
  });

  it("flags Next.js Link without an accessible name", () => {
    expect(
      run(anchorNameCheck, `const A = () => <Link href="/cart"><svg /></Link>;`),
    ).toHaveLength(1);
  });

  it("skips anchors without href, prop-spreading hosts, and named links", () => {
    expect(
      run(anchorNameCheck, `const A = () => <a><svg /></a>;`),
    ).toHaveLength(0);
    expect(
      run(
        anchorNameCheck,
        `const A = ({...p}) => <a href="/x" {...p}><svg /></a>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        anchorNameCheck,
        `const A = () => <a href="/x" aria-label="Cart"><svg /></a>;`,
      ),
    ).toHaveLength(0);
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

  it("flags string and lowercase tabindex positives", () => {
    expect(
      run(
        positiveTabindexCheck,
        `const A = () => <div tabIndex="2">x</div>;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        positiveTabindexCheck,
        `const A = () => <div tabindex={4}>x</div>;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts tabIndex of 0 and -1 and skips dynamic values", () => {
    const source = `const A = () => (<div><div tabIndex={0} /><div tabIndex={-1} /><div tabIndex={n} /></div>);`;
    expect(run(positiveTabindexCheck, source)).toHaveLength(0);
  });

  it("ignores boolean shorthand tabIndex", () => {
    expect(
      run(positiveTabindexCheck, `const A = () => <div tabIndex>x</div>;`),
    ).toHaveLength(0);
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

  it("flags unlabeled select and textarea", () => {
    expect(
      run(inputLabelCheck, `const A = () => <select name="country" />;`),
    ).toHaveLength(1);
    expect(
      run(inputLabelCheck, `const A = () => <textarea name="bio" />;`),
    ).toHaveLength(1);
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
    expect(findings[0]).toMatchObject({
      checkId: "empty-heading",
      kind: "violation",
      severity: "serious",
    });
    expect(findings[0]?.reason).toContain("no text content");
  });

  it("flags self-closing headings", () => {
    const findings = run(emptyHeadingCheck, `const A = () => <h3 />;`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("<h3 />");
  });

  it("accepts text content and aria-label", () => {
    expect(
      run(emptyHeadingCheck, `const A = () => <h2>Section</h2>;`),
    ).toHaveLength(0);
    expect(
      run(
        emptyHeadingCheck,
        `const A = () => <h2 aria-label="Section"></h2>;`,
      ),
    ).toHaveLength(0);
  });

  it("does not treat title alone as a name (includeTitle: false)", () => {
    expect(
      run(emptyHeadingCheck, `const A = () => <h2 title="Section"></h2>;`),
    ).toHaveLength(1);
  });

  it("ignores non-heading tags", () => {
    expect(
      run(emptyHeadingCheck, `const A = () => <p></p>;`),
    ).toHaveLength(0);
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
  it("flags video with autoPlay and proposes removing the attribute", () => {
    const findings = run(
      autoplayMediaCheck,
      `const A = () => <video src="/x.mp4" autoPlay />;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({
      kind: "remove_attribute",
      attribute: "autoPlay",
    });
  });
});

describe("duplicate-id", () => {
  it("flags repeated id values in a file", () => {
    const findings = run(
      duplicateIdCheck,
      `const A = () => (<div><span id="x" /><button id="x" /></div>);`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toContain('id="x"');
  });

  it("reports each occurrence after the first", () => {
    const findings = run(
      duplicateIdCheck,
      `const A = () => (<div><span id="x" /><button id="x" /><i id="x" /></div>);`,
    );
    expect(findings).toHaveLength(2);
  });

  it("ignores unique, empty, and dynamic ids", () => {
    expect(
      run(
        duplicateIdCheck,
        `const A = () => (<div><span id="a" /><button id="b" /><i id="" /><b id={id} /></div>);`,
      ),
    ).toHaveLength(0);
  });
});

describe("aria-hidden-focusable", () => {
  it("flags focusable elements with aria-hidden", () => {
    const findings = run(
      ariaHiddenFocusableCheck,
      `const A = () => <button aria-hidden="true">x</button>;`,
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag aria-hidden={false}", () => {
    const findings = run(
      ariaHiddenFocusableCheck,
      `const A = () => <button aria-hidden={false}>x</button>;`,
    );
    expect(findings).toHaveLength(0);
  });

  it("flags boolean shorthand aria-hidden on a focusable control", () => {
    const findings = run(
      ariaHiddenFocusableCheck,
      `const A = () => <button aria-hidden>x</button>;`,
    );
    expect(findings).toHaveLength(1);
  });

  it("flags widget roles, media, and tabindex that the old tag list missed", () => {
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <div role="button" aria-hidden="true">x</div>;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <video aria-hidden="true" />;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <div tabIndex={0} aria-hidden="true">x</div>;`,
      ),
    ).toHaveLength(1);
  });

  it("does not flag non-focusable or disabled hosts", () => {
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <a aria-hidden="true">x</a>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <button disabled aria-hidden="true">x</button>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        ariaHiddenFocusableCheck,
        `const A = () => <div aria-hidden="true">x</div>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("meta-viewport", () => {
  it("flags viewport that disables zoom", () => {
    const findings = run(
      metaViewportCheck,
      `const H = () => <meta name="viewport" content="width=device-width, user-scalable=no" />;`,
    );
    expect(findings).toHaveLength(1);
  });

  it("flags user-scalable=0 and user-scalable=false", () => {
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="user-scalable=0" />;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="user-scalable=false" />;`,
      ),
    ).toHaveLength(1);
  });

  it("flags maximum-scale below 2", () => {
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="maximum-scale=1" />;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="maximum-scale=1.5" />;`,
      ),
    ).toHaveLength(1);
  });

  it("accepts a zoomable viewport and maximum-scale >= 2", () => {
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="width=device-width, initial-scale=1" />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content="maximum-scale=2" />;`,
      ),
    ).toHaveLength(0);
  });

  it("ignores non-viewport meta, missing content, and dynamic content", () => {
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="description" content="x" />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(metaViewportCheck, `const H = () => <meta name="viewport" />;`),
    ).toHaveLength(0);
    expect(
      run(
        metaViewportCheck,
        `const H = () => <meta name="viewport" content={content} />;`,
      ),
    ).toHaveLength(0);
  });
});

describe("list-structure", () => {
  it("flags orphan list items and non-li list children", () => {
    const orphan = run(listStructureCheck, `const A = () => <div><li>x</li></div>;`);
    expect(orphan).toHaveLength(1);
    expect(orphan[0]?.reason).toContain("found under <div>");
    expect(orphan[0]?.confidence).toBe("high");

    expect(
      run(
        listStructureCheck,
        `const A = () => <ul><div>not an item</div></ul>;`,
      ),
    ).toHaveLength(1);
  });

  it("flags list items with no enclosing JSX parent", () => {
    const findings = run(listStructureCheck, `const item = <li>x</li>;`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe("medium");
    expect(findings[0]?.reason).toContain("no list parent");
  });

  it("flags self-closing non-li children inside lists", () => {
    const findings = run(
      listStructureCheck,
      `const A = () => <ol><img src="/x.png" alt="" /></ol>;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("<img>");
  });

  it("accepts well-formed lists including menu", () => {
    expect(
      run(
        listStructureCheck,
        `const A = () => <ul><li>One</li><li>Two</li></ul>;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        listStructureCheck,
        `const A = () => <menu><li>A</li></menu>;`,
      ),
    ).toHaveLength(0);
  });

  it("ignores whitespace and expression children that are not elements", () => {
    expect(
      run(
        listStructureCheck,
        `const A = () => <ul>{items}<li>One</li></ul>;`,
      ),
    ).toHaveLength(0);
  });
});

describe("autocomplete-valid", () => {
  it("flags invalid autocomplete tokens", () => {
    const findings = run(
      autocompleteValidCheck,
      `const A = () => <input autoComplete="not-a-real-token" />;`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("not-a-real-token");
  });

  it("accepts valid tokens including section and grouping prefixes", () => {
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <input autoComplete="email" />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <input autocomplete="section-billing shipping email" />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <input autoComplete="optional given-name" />;`,
      ),
    ).toHaveLength(0);
  });

  it("flags empty token sets and invalid tokens on select/textarea", () => {
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <input autoComplete="   " />;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <select autoComplete="nope" />;`,
      ),
    ).toHaveLength(1);
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <textarea autoComplete="xyz" />;`,
      ),
    ).toHaveLength(1);
  });

  it("skips dynamic values and non-form controls", () => {
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <input autoComplete={value} />;`,
      ),
    ).toHaveLength(0);
    expect(
      run(
        autocompleteValidCheck,
        `const A = () => <div autoComplete="email" />;`,
      ),
    ).toHaveLength(0);
  });
});

