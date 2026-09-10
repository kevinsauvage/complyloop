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
        parseSource("test.tsx", `const A = () => <p dir="rtl">שלום</p><p>Hello</p>;`),
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
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="user-scalable=0" />;`),
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
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="maximum-scale=1" />;`),
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
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="maximum-scale=2" />;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-viewport meta, missing content, and dynamic content", () => {
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="description" content="x" />;`),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(parseSource("test.tsx", `const H = () => <meta name="viewport" />;`)),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" content={content} />;`),
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
        parseSource("test.tsx", `const A = () => <p style={{ color: "red" }}>Hi</p>;`),
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

const ASCII_ART = [
  "+-----+",
  "| hi  |",
  "+-----+",
].join("\n");

describe("cryptic-content-alt", () => {
  it("flags ASCII art pre blocks without alternatives", () => {
    const findings = crypticContentAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<pre>${ASCII_ART}</pre>);`,
      ),
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
      parseSource("test.tsx", `const A = () => <a href="/report">Click here</a>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("warns on learn more link text", () => {
    const findings = linkExplicitHeuristicCheck.run(
      parseSource("test.tsx", `const A = () => <a href="/report">Learn more</a>;`),
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
