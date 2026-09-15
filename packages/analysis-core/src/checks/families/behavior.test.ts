import { describe, expect, it } from "vitest";

import { parseSource } from "../../parse";
import {
  bothColorsCheck,
  crypticContentAltCheck,
  dirChangeCheck,
  langChangeCheck,
  linkExplicitHeuristicCheck,
  metaViewportCheck,
  newWindowOnloadCheck,
  statusLiveCheck,
  textSpacingCheck,
} from "./behavior";

describe("status-live", () => {
  it("warns on invalid field without live error region", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <input aria-invalid="true" aria-label="Email" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts invalid field with alert role sibling", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <div>
              <input aria-invalid="true" aria-label="Email" />
              <p role="alert">Required</p>
            </div>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("new-window-onload", () => {
  it("flags window.open in mount useEffect", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => { useEffect(() => { window.open("/promo"); }, []); return null; };`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores window.open inside click handlers", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <button onClick={() => window.open("/help")}>Help</button>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on target=_blank without a new-window warning", () => {
    const findings = newWindowOnloadCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <a href="https://example.com" target="_blank">External site</a>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("keeps attributes on a multiline target=_blank link snippet", () => {
    const findings = newWindowOnloadCheck.run(
      parseSource(
        "test.tsx",
        [
          `const A = () => (`,
          `  <a`,
          `    href="https://example.com"`,
          `    target="_blank"`,
          `  >`,
          `    External site`,
          `  </a>`,
          `);`,
        ].join("\n"),
      ),
    );
    expect(findings).toHaveLength(1);
    const location = findings[0]?.location;
    expect(location?.kind).toBe("source");
    if (location?.kind !== "source") return;
    expect(location.snippet).toContain("<a");
    expect(location.snippet).toContain('target="_blank"');
  });
});

describe("dir-change", () => {
  it("warns when RTL text lacks dir in a mixed file", () => {
    const findings = dirChangeCheck.run(
      parseSource("test.tsx", `const A = () => <p>Hello שלום world</p>;`),
    );
    expect(findings.some((f) => f.checkId === "dir-change")).toBe(true);
  });

  it("accepts RTL text inside dir=rtl", () => {
    expect(
      dirChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p dir="rtl">שלום</p><p>Hello</p>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("lang-change", () => {
  it("flags French text on an English page without lang", () => {
    const findings = langChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<html lang="en"><p>Bienvenue à Paris</p></html>);`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.checkId).toBe("lang-change");
  });

  it("accepts foreign text wrapped with lang", () => {
    expect(
      langChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<html lang="en"><p lang="fr">Bienvenue à Paris</p></html>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags Cyrillic text without lang on a French page", () => {
    const findings = langChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<html lang="fr"><p>Привет</p></html>);`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("skips script-mismatch detection when no lang is declared", () => {
    expect(
      langChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<html><p>Bienvenue à Paris</p></html>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("meta-viewport", () => {
  it("flags viewport that disables zoom", () => {
    const findings = metaViewportCheck.run(
      parseSource(
        "test.tsx",
        `const H = () => <meta name="viewport" content="width=device-width, user-scalable=no" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags user-scalable=0 and user-scalable=false", () => {
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="user-scalable=0" />;`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="user-scalable=false" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags maximum-scale below 2", () => {
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="maximum-scale=1" />;`,
        ),
      ),
    ).toHaveLength(1);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="maximum-scale=1.5" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a zoomable viewport and maximum-scale >= 2", () => {
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="width=device-width, initial-scale=1" />;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="maximum-scale=2" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-viewport meta, missing content, and dynamic content", () => {
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="description" content="x" />;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" />;`),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content={content} />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("text-spacing", () => {
  it("flags inline spacing styles that use !important", () => {
    expect(
      textSpacingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ letterSpacing: "0.12em !important" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("ignores spacing styles without !important", () => {
    expect(
      textSpacingCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ letterSpacing: "0.02em", lineHeight: 1.5 }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("both-colors", () => {
  it("warns when inline style sets color without background", () => {
    expect(
      bothColorsCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ color: "red" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts paired color and background", () => {
    expect(
      bothColorsCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ color: "red", backgroundColor: "white" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

const ASCII_ART = ["+-----+", "| hi  |", "+-----+"].join("\n");

describe("cryptic-content-alt", () => {
  it("flags ASCII art pre blocks without alternatives", () => {
    const findings = crypticContentAltCheck.run(
      parseSource("test.tsx", `const A = () => (<pre>${ASCII_ART}</pre>);`),
    );
    expect(findings.some((finding) => finding.kind === "violation")).toBe(true);
  });

  it("accepts ASCII art with aria-label", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<pre aria-label="Smiley face made of punctuation">${ASCII_ART}</pre>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on emoticon-only span without accessible name", () => {
    const findings = crypticContentAltCheck.run(
      parseSource("test.tsx", `const A = () => <span>:-)</span>;`),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.kind).toBe("warning");
  });
});

describe("link-explicit-heuristic", () => {
  it("warns on vague link text", () => {
    const findings = linkExplicitHeuristicCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <a href="/report">Click here</a>;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("warns on learn more link text", () => {
    const findings = linkExplicitHeuristicCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <a href="/report">Learn more</a>;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("accepts descriptive link text", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="/report">Download annual report</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on French vague link text", () => {
    const findings = linkExplicitHeuristicCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <a href="/report">En savoir plus</a>;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });
});

describe("status-live helpers", () => {
  it("warns on bare Toaster without live region or role", () => {
    expect(
      statusLiveCheck.run(
        parseSource("test.tsx", `const A = () => <Toaster />;`),
      ),
    ).toHaveLength(1);
  });

  it("warns on bare Sonner without live region or role", () => {
    expect(
      statusLiveCheck.run(
        parseSource("test.tsx", `const A = () => <Sonner />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts Toaster with aria-live", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <Toaster aria-live="polite" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts Toaster with role=status", () => {
    expect(
      statusLiveCheck.run(
        parseSource("test.tsx", `const A = () => <Toaster role="status" />;`),
      ),
    ).toHaveLength(0);
  });

  it("accepts invalid field described by an aria-live region", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="err" /><p id="err" aria-live="polite">Required</p></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts invalid field described by a role=alert region", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="err" /><p id="err" role="alert">Required</p></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts invalid field described by a live region among several ids", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="missing err" /><p id="err" aria-live="polite">Required</p></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts invalid field described by a live region with trailing siblings", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="err" /><p id="err" aria-live="polite">Required</p><span>after</span></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns when aria-describedby points at a non-live region", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="hint" /><p id="hint">Enter your email</p></div>);`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("warns when aria-describedby points at a missing id", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" aria-describedby="missing" /></div>);`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts invalid field with an aria-live sibling", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" /><p aria-live="polite">Required</p></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on invalid field in a plain div without a live sibling", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><input aria-invalid="true" aria-label="Email" /><span>hint</span></div>);`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a container with aria-invalid wrapping a live descendant", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div aria-invalid="true"><span role="alert">Error</span></div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("warns on a container with aria-invalid wrapping only static text", () => {
    expect(
      statusLiveCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div aria-invalid="true"><span>hint</span></div>);`,
        ),
      ),
    ).toHaveLength(1);
  });
});

describe("new-window-onload edge cases", () => {
  it("ignores useEffect with a single argument calling window.open", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => { useEffect(() => { window.open("/promo"); }); return null; };`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores useEffect with empty deps but no window.open", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => { useEffect(() => { console.log("hi"); }, []); return null; };`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("flags a bare top-level window.open call", () => {
    const findings = newWindowOnloadCheck.run(
      parseSource("test.tsx", `window.open("/promo"); const A = () => null;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("new-window-onload");
  });

  it("accepts target=_blank link with aria-describedby", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="https://example.com" target="_blank" aria-describedby="d">External site</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("accepts target=_blank link warning about the new window", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="https://example.com" target="_blank">External site opens in new window</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores links without target=_blank", () => {
    expect(
      newWindowOnloadCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="/about">About us</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("dir-change edge cases", () => {
  it("ignores an LTR-only file", () => {
    expect(
      dirChangeCheck.run(
        parseSource("test.tsx", `const A = () => <p>Hello world</p>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores dir with a non-rtl/ltr value in a mixed file", () => {
    expect(
      dirChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div dir="auto">Hello שלום</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("handles a dir tag whose parent is not an element in a mixed file", () => {
    const findings = dirChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<><div dir="rtl" /><p>Hello שלום</p></>);`,
      ),
    );
    expect(findings.some((f) => f.checkId === "dir-change")).toBe(true);
  });

  it("flags a dir element with mixed-direction text siblings", () => {
    const findings = dirChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div>Hello <span dir="rtl">x</span> שלום</div>);`,
      ),
    );
    expect(findings.some((f) => f.checkId === "dir-change")).toBe(true);
  });

  it("flags a self-closing dir element with mixed-direction siblings", () => {
    const findings = dirChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<div>Hello <img dir="rtl" /> שלום</div>);`,
      ),
    );
    expect(findings).toHaveLength(2);
  });

  it("accepts a dir element nested under an ancestor with dir", () => {
    expect(
      dirChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div dir="ltr">Hello <span dir="rtl">x</span> שלום</div>);`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores a dir element without mixed-direction siblings", () => {
    expect(
      dirChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<div><span dir="rtl">hi</span><p>Hello שלום</p></div>);`,
        ),
      ),
    ).toHaveLength(1);
  });
});

describe("lang-change edge cases", () => {
  it("flags Cyrillic text on an English page", () => {
    const findings = langChangeCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<html lang="en"><p>Привет мир</p></html>);`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("accepts plain English text on an English page", () => {
    expect(
      langChangeCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (<html lang="en"><p>Hello world</p></html>);`,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("meta-viewport edge cases", () => {
  it("ignores non-meta elements", () => {
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <div />;`),
      ),
    ).toHaveLength(0);
  });
});

describe("both-colors edge cases", () => {
  it("ignores elements without inline style", () => {
    expect(
      bothColorsCheck.run(
        parseSource("test.tsx", `const A = () => <p>Hi</p>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-object style expressions", () => {
    expect(
      bothColorsCheck.run(
        parseSource("test.tsx", `const A = () => <p style={myStyle}>Hi</p>;`),
      ),
    ).toHaveLength(0);
  });

  it("warns on spread style with only color", () => {
    expect(
      bothColorsCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ ...base, color: "red" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("warns on background-only style", () => {
    expect(
      bothColorsCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <p style={{ backgroundColor: "white" }}>Hi</p>;`,
        ),
      ),
    ).toHaveLength(1);
  });
});

describe("cryptic-content-alt edge cases", () => {
  it("accepts single-line pre blocks", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource("test.tsx", `const A = () => (<pre>just some text</pre>);`),
      ),
    ).toHaveLength(0);
  });

  it("ignores emoticon text in a fragment without a host", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource("test.tsx", `const A = () => <>:-)</>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores self-closing spans", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource("test.tsx", `const A = () => <span />;`),
      ),
    ).toHaveLength(0);
  });

  it("accepts emoticon spans with an accessible name", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <span aria-label="smile">:-)</span>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-emoticon spans", () => {
    expect(
      crypticContentAltCheck.run(
        parseSource("test.tsx", `const A = () => <span>hello</span>;`),
      ),
    ).toHaveLength(0);
  });

  it("warns on emoticon-only paragraph text", () => {
    const findings = crypticContentAltCheck.run(
      parseSource("test.tsx", `const A = () => <p>:-)</p>;`),
    );
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("link-explicit-heuristic edge cases", () => {
  it("ignores self-closing links", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource("test.tsx", `const A = () => <a href="/report" />;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores spreading links even with vague text", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <a href="/report" {...props}>Click here</a>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores empty links", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource("test.tsx", `const A = () => <a href="/report"></a>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-link elements", () => {
    expect(
      linkExplicitHeuristicCheck.run(
        parseSource("test.tsx", `const A = () => <div>Click here</div>;`),
      ),
    ).toHaveLength(0);
  });
});
