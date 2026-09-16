import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureSnapshot, detectChanges, readRepoHead, summarizeChanges } from "./monitor";

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
  it("returns no changes when there is no previous snapshot", async () => {
    const { changes, snapshot } = await detectChanges(rootPath, undefined);
    expect(changes).toHaveLength(0);
    expect(snapshot.fileHashes["A.tsx"]).toBeDefined();
  });

  it("detects modified and deleted files", async () => {
    const previous = await captureSnapshot(rootPath);
    fs.writeFileSync(
      path.join(rootPath, "A.tsx"),
      "export const A = () => <img src='/x' />;\n",
    );
    fs.writeFileSync(
      path.join(rootPath, "B.tsx"),
      "export const B = () => null;\n",
    );
    const { changes } = await detectChanges(rootPath, previous);
    const paths = changes.map((change) => change.filePath).sort();
    expect(paths).toEqual(["A.tsx", "B.tsx"]);
  });

  it("summarizes change lists for evidence copy", () => {
    expect(
      summarizeChanges([{ filePath: "a.tsx" }, { filePath: "b.tsx" }]),
    ).toBe("2 file(s) changed: a.tsx, b.tsx");
  });
});

describe("readRepoHead", () => {
  it("resolves HEAD with pure-JS git (no CLI)", async () => {
    await git.init({ fs, dir: rootPath });
    await git.add({ fs, dir: rootPath, filepath: "A.tsx" });
    await git.commit({
      fs,
      dir: rootPath,
      author: { name: "test", email: "test@example.com" },
      message: "init",
    });

    await expect(readRepoHead(rootPath)).resolves.toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns undefined outside a repository", async () => {
    await expect(readRepoHead(rootPath)).resolves.toBeUndefined();
  });
});
