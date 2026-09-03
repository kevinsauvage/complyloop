import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkIdForJsxA11yRule, jsxA11yMappedCheckIds } from "./jsx-a11y-map";
import { scanFile } from "./scan";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function scanSnippet(source: string, fileName = "a.tsx"): ReturnType<typeof scanFile> {
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
    const findings = scanSnippet(`export const A = () => <img src="/x.png" />;`);
    const finding = findings.find((candidate) => candidate.checkId === "img-alt");
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
    expect(findings.some((finding) => finding.checkId === "img-alt")).toBe(true);
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
    expect(findings.some((finding) => finding.checkId === "img-alt")).toBe(true);
  });
});
