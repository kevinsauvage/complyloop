import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanChangedFiles, scanFile, scanProject } from "./scan";

const tempDirs: string[] = [];

function makeTempTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  tempDirs.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanFile", () => {
  it("returns findings for a JSX file with a known violation", () => {
    const root = makeTempTree({
      "Hero.tsx": "export const Hero = () => <img src='/x.png' />;",
    });
    const findings = scanFile(root, "Hero.tsx");
    expect(findings.some((finding) => finding.checkId === "img-alt")).toBe(
      true,
    );
  });

  it("returns no findings when the file is missing or escapes the root", () => {
    const root = makeTempTree({
      "ok.tsx": "export const Ok = () => <p>Hi</p>;",
    });
    expect(scanFile(root, "missing.tsx")).toEqual([]);
    expect(scanFile(root, "../outside.tsx")).toEqual([]);
  });
});

describe("scanProject", () => {
  it("scans every JSX file and reports a full scan", () => {
    const root = makeTempTree({
      "src/Hero.tsx": "export const Hero = () => <img src='/x.png' />;",
      "src/util.ts": "export const x = 1;",
      "README.md": "# demo",
    });
    const result = scanProject(root);
    expect(result.scanMode).toBe("full");
    expect(result.filesScanned).toBe(1);
    expect(
      result.findings.some((finding) => finding.checkId === "img-alt"),
    ).toBe(true);
  });
});

describe("scanChangedFiles", () => {
  it("scans only existing JSX paths and skips deleted or non-JSX files", () => {
    const root = makeTempTree({
      "src/Hero.tsx": "export const Hero = () => <img src='/x.png' />;",
      "src/ok.tsx": "export const Ok = () => <p>Hi</p>;",
    });
    const result = scanChangedFiles(root, [
      "src/Hero.tsx",
      "src/deleted.tsx",
      "src/util.ts",
      "../escape.tsx",
      "src/Hero.tsx",
    ]);
    expect(result.scanMode).toBe("scoped");
    expect(result.filesScanned).toBe(1);
    expect(
      result.findings.some((finding) => finding.checkId === "img-alt"),
    ).toBe(true);
  });
});
