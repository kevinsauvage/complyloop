import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureSnapshot, detectChanges, summarizeChanges } from "./monitor";

let rootPath: string;

beforeEach(() => {
  rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
  fs.writeFileSync(
    path.join(rootPath, "A.tsx"),
    "export const A = () => <div />;\n",
  );
});

afterEach(() => {
  fs.rmSync(rootPath, { recursive: true, force: true });
});

describe("detectChanges", () => {
  it("returns no changes when there is no previous snapshot", () => {
    const { changes, snapshot } = detectChanges(rootPath, undefined);
    expect(changes).toHaveLength(0);
    expect(snapshot.fileHashes["A.tsx"]).toBeDefined();
  });

  it("detects modified and deleted files", () => {
    const previous = captureSnapshot(rootPath);
    fs.writeFileSync(
      path.join(rootPath, "A.tsx"),
      "export const A = () => <img src='/x' />;\n",
    );
    fs.writeFileSync(
      path.join(rootPath, "B.tsx"),
      "export const B = () => null;\n",
    );
    const { changes } = detectChanges(rootPath, previous);
    const paths = changes.map((change) => change.filePath).sort();
    expect(paths).toEqual(["A.tsx", "B.tsx"]);
  });

  it("summarizes change lists for evidence copy", () => {
    expect(
      summarizeChanges([{ filePath: "a.tsx" }, { filePath: "b.tsx" }]),
    ).toBe("2 file(s) changed: a.tsx, b.tsx");
  });
});
