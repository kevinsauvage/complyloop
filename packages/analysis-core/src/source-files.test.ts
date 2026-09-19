import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  hasSourceFiles,
  listSourceFiles,
  shouldSnapshotFile,
} from "./source-files";

const tempDirs: string[] = [];

function makeTempTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-files-"));
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

describe("listSourceFiles", () => {
  it("lists JSX sources and ignores node_modules", () => {
    const root = makeTempTree({
      "src/App.tsx": "export const A = () => null;",
      "src/util.ts": "export const x = 1;",
      "node_modules/pkg/index.tsx": "export const Bad = () => null;",
    });
    const files = listSourceFiles(root, "jsx");
    expect(files).toEqual([path.join(root, "src/App.tsx")]);
  });

  it("lists script extensions when requested", () => {
    const root = makeTempTree({
      "a.tsx": "export {};",
      "b.ts": "export {};",
      "c.js": "export {};",
    });
    const files = listSourceFiles(root, "script");
    expect(files).toEqual([
      path.join(root, "a.tsx"),
      path.join(root, "b.ts"),
      path.join(root, "c.js"),
    ]);
  });
});

describe("hasSourceFiles", () => {
  it("returns true when matching files exist and false otherwise", () => {
    const withScripts = makeTempTree({ "lib/index.ts": "export {};" });
    expect(hasSourceFiles(withScripts, "script")).toBe(true);
    expect(hasSourceFiles(withScripts, "jsx")).toBe(false);

    const empty = makeTempTree({ "README.md": "# hi" });
    expect(hasSourceFiles(empty, "script")).toBe(false);
  });
});

describe("shouldSnapshotFile", () => {
  it("matches the script glob set on a tricky tree", () => {
    const root = makeTempTree({
      "src/App.tsx": "x",
      "src/util.ts": "x",
      "README.md": "x",
      "node_modules/pkg/index.ts": "x",
      ".next/build.js": "x",
      "dist/bundle.js": "x",
      ".hidden/secret.ts": "x",
      ".eslintrc.js": "x",
      "dist.ts": "x",
      "App.TSX": "x",
    });
    const listed = new Set(
      listSourceFiles(root, "script").map((absolute) =>
        path.relative(root, absolute),
      ),
    );
    const candidates = [
      "src/App.tsx",
      "src/util.ts",
      "README.md",
      "node_modules/pkg/index.ts",
      ".next/build.js",
      "dist/bundle.js",
      ".hidden/secret.ts",
      ".eslintrc.js",
      "dist.ts",
      "App.TSX",
    ];
    for (const relative of candidates) {
      expect(shouldSnapshotFile(relative), relative).toBe(listed.has(relative));
    }
    expect(shouldSnapshotFile("dist.ts")).toBe(true);
    expect(shouldSnapshotFile("App.TSX")).toBe(false);
  });
});
