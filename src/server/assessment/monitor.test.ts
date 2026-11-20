import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureSnapshot,
  detectChanges,
  readRepoHead,
  summarizeChanges,
} from "./monitor";

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

  it("summarizes a long change list with a remainder count", () => {
    const changes = ["a", "b", "c", "d", "e", "f", "g"].map((filePath) => ({
      filePath,
    }));

    expect(summarizeChanges(changes)).toBe(
      "7 file(s) changed: a, b, c, d, e (+2 more)",
    );
  });

  it("reports a single unchanged file as no change", () => {
    expect(summarizeChanges([])).toBe(
      "No source changes since the previous assessment.",
    );
  });

  it("snapshots exactly the script set (node_modules/dotfiles excluded)", async () => {
    fs.mkdirSync(path.join(rootPath, "node_modules", "pkg"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(rootPath, "node_modules", "pkg", "index.ts"),
      "export {};\n",
    );
    fs.writeFileSync(path.join(rootPath, ".hidden.ts"), "export {};\n");
    fs.writeFileSync(path.join(rootPath, "util.ts"), "export {};\n");
    const snapshot = await captureSnapshot(rootPath);
    expect(Object.keys(snapshot.fileHashes).sort()).toEqual([
      "A.tsx",
      "util.ts",
    ]);
  });

  it("fails the snapshot walk when the checkout exceeds quota", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_FILES", "1");
    try {
      fs.writeFileSync(path.join(rootPath, "B.tsx"), "export {};\n");
      await expect(captureSnapshot(rootPath)).rejects.toThrow(
        /assessment quota/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails the walk when the checkout exceeds the byte quota", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", "1");
    try {
      await expect(captureSnapshot(rootPath)).rejects.toThrow(
        /assessment quota/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("abandons the walk when it runs past its time budget", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_SCAN_MS", "1");
    let calls = 0;
    vi.spyOn(Date, "now").mockImplementation(() =>
      calls++ === 0 ? 1_000 : 100_000,
    );
    try {
      await expect(captureSnapshot(rootPath)).rejects.toThrow(/timed out/);
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });

  it("keeps walking when a directory cannot be opened", async () => {
    fs.mkdirSync(path.join(rootPath, "sub"));
    fs.writeFileSync(path.join(rootPath, "sub", "B.tsx"), "export {};\n");
    const opendir = fs.promises.opendir;
    let calls = 0;
    const spy = vi.spyOn(fs.promises, "opendir").mockImplementation((async (
      target: fs.PathLike,
    ) => {
      calls += 1;
      if (calls === 2) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      }
      return opendir(target);
    }) as typeof fs.promises.opendir);

    try {
      const snapshot = await captureSnapshot(rootPath);
      // The unreadable subtree is skipped; the rest of the tree still lands.
      expect(snapshot.fileHashes["A.tsx"]).toBeDefined();
      expect(snapshot.fileHashes["sub/B.tsx"]).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
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
