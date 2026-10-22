import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkIdForJsxA11yRule, jsxA11yMappedCheckIds } from "./jsx-a11y-map";
import { lintJsxA11y } from "./jsx-a11y-scan";
import { parseSource } from "./parse";
import { scanFile } from "./scan";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function scanSnippet(
  source: string,
  fileName = "a.tsx",
): ReturnType<typeof scanFile> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-a11y-"));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, fileName), source);
  return scanFile(root, fileName);
}

describe("jsx-a11y-map", () => {
  it("maps plugin rule ids with and without the prefix", () => {
    expect(checkIdForJsxA11yRule("jsx-a11y/alt-text")).toBe("img-alt");
    expect(checkIdForJsxA11yRule("alt-text")).toBe("img-alt");
    expect(checkIdForJsxA11yRule("anchor-is-valid")).toBeUndefined();
    expect(jsxA11yMappedCheckIds()).toContain("img-alt");
    expect(jsxA11yMappedCheckIds()).toContain("html-lang-valid");
  });
});

describe("jsx-a11y source scan", () => {
  it("flags a missing img alt as img-alt", () => {
    const findings = scanSnippet(
      `export const A = () => <img src="/x.png" />;`,
    );
    const finding = findings.find(
      (candidate) => candidate.checkId === "img-alt",
    );
    expect(finding?.fix).toEqual({
      kind: "insert_attribute",
      attribute: "alt",
      value: "Describe this image",
      editable: true,
      span: expect.any(Object),
    });
  });

  it("flags an unlabeled input as input-label", () => {
    const findings = scanSnippet(
      `export const Form = () => <input type="email" />;`,
    );
    expect(findings.some((finding) => finding.checkId === "input-label")).toBe(
      true,
    );
  });

  it("flags a clickable div as keyboard-interaction", () => {
    const findings = scanSnippet(
      `export const X = () => <div onClick={() => undefined}>Go</div>;`,
    );
    expect(
      findings.some((finding) => finding.checkId === "keyboard-interaction"),
    ).toBe(true);
  });

  it("parses TypeScript and does not flag a labelled input", () => {
    const findings = scanSnippet(`
      export function Field() {
        return (
          <>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" />
          </>
        );
      }
    `);
    expect(findings.some((finding) => finding.checkId === "input-label")).toBe(
      false,
    );
  });

  it("treats Next.js Image like img", () => {
    const findings = scanSnippet(
      `export const Hero = () => <Image src="/hero.png" />;`,
    );
    expect(findings.some((finding) => finding.checkId === "img-alt")).toBe(
      true,
    );
  });

  it("keeps attributes when the flagged tag spans multiple lines", () => {
    const findings = scanSnippet(
      [
        `export const Hero = () => (`,
        `  <img`,
        `    src="/hero.png"`,
        `  />`,
        `);`,
      ].join("\n"),
    );
    const finding = findings.find(
      (candidate) => candidate.checkId === "img-alt",
    );
    const location = finding?.location;
    expect(location?.kind).toBe("source");
    if (location?.kind !== "source") return;
    expect(location.line).toBe(2);
    expect(location.snippet).toContain("<img");
    expect(location.snippet).toContain('src="/hero.png"');
  });

  it("proposes removing autoFocus", () => {
    const source = "export const Field = () => <input autoFocus />;\n";
    const findings = scanSnippet(source);
    const finding = findings.find(
      (candidate) => candidate.checkId === "no-autofocus",
    );
    expect(finding?.fix?.kind).toBe("remove_attribute");
    if (finding?.fix?.kind !== "remove_attribute") return;
    expect(source.slice(finding.fix.span.start, finding.fix.span.end)).toMatch(
      /autoFocus/,
    );
  });

  it("matches nested source paths in the ESLint files glob", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jsx-a11y-"));
    tempDirs.push(root);
    const nested = path.join(root, "src", "pages");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "hero.tsx"),
      `export const Hero = () => <img src="/x.png" />;`,
    );
    const findings = scanFile(root, "src/pages/hero.tsx");
    expect(findings.some((finding) => finding.checkId === "img-alt")).toBe(
      true,
    );
  });
});

describe("jsx-a11y fix fallbacks", () => {
  it("removes both accesskey spellings", () => {
    const cases = [
      {
        source:
          "export const Save = () => <button accesskey='s'>Save</button>;\n",
        checkId: "no-accesskey",
        pattern: /accesskey=/,
      },
      {
        source:
          "export const Save = () => <button accessKey='s'>Save</button>;\n",
        checkId: "no-accesskey",
        pattern: /accessKey=/,
      },
    ] as const;
    for (const { source, checkId, pattern } of cases) {
      const finding = scanSnippet(source).find(
        (candidate) => candidate.checkId === checkId,
      );
      expect(finding?.fix?.kind).toBe("remove_attribute");
      if (finding?.fix?.kind !== "remove_attribute") continue;
      expect(
        source.slice(finding.fix.span.start, finding.fix.span.end),
      ).toMatch(pattern);
    }
  });

  it("leaves redundant-alt findings without a fix when alt is present", () => {
    const findings = scanSnippet(
      `export const Hero = () => <img src="/cat.png" alt="picture of a cat" />;`,
    );
    const finding = findings.find(
      (candidate) => candidate.checkId === "img-alt",
    );
    expect(finding).toBeDefined();
    expect(finding?.fix).toBeNull();
  });

  it("skips fatal parse messages without a rule id", () => {
    expect(lintJsxA11y(parseSource("bad.tsx", "const x = {{{;"))).toEqual([]);
  });
});

describe("jsx-a11y recommended patterns", () => {
  it("does not flag a native <dialog> with a backdrop-dismiss onClick", () => {
    const findings = lintJsxA11y(
      parseSource(
        "dialog.tsx",
        `export const D = () => <dialog aria-label="Menu" onClick={(e) => e.target === e.currentTarget && close()}>x</dialog>;`,
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it("still flags a static div with only an onClick", () => {
    const findings = lintJsxA11y(
      parseSource(
        "div.tsx",
        `export const D = () => <div onClick={go}>x</div>;`,
      ),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("allows tabIndex on a named scrollable region", () => {
    const findings = lintJsxA11y(
      parseSource(
        "region.tsx",
        `export const R = () => <div role="region" aria-label="Cookies" tabIndex={0} className="overflow-x-auto"><table /></div>;`,
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it("still flags tabIndex on a non-scrollable or unnamed region", () => {
    const unscrollable = lintJsxA11y(
      parseSource(
        "a.tsx",
        `export const R = () => <div role="region" aria-label="Cookies" tabIndex={0}>x</div>;`,
      ),
    );
    const unnamed = lintJsxA11y(
      parseSource(
        "b.tsx",
        `export const R = () => <div role="region" tabIndex={0} className="overflow-auto">x</div>;`,
      ),
    );
    expect(unscrollable.length).toBeGreaterThan(0);
    expect(unnamed.length).toBeGreaterThan(0);
  });

  it("does not flag a link wrapper that forwards its props (children included)", () => {
    const findings = lintJsxA11y(
      parseSource(
        "link.tsx",
        `import Link from "next/link";\nexport const L = ({ href, ...rest }) => <Link {...rest} href={href} />;`,
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it("still flags an empty anchor with no forwarded props", () => {
    const findings = lintJsxA11y(
      parseSource("a.tsx", `export const A = () => <a href="/x"></a>;`),
    );
    expect(findings.length).toBeGreaterThan(0);
  });
});
