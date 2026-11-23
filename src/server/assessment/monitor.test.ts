import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCheckoutQuota,
  type CompareCommits,
  readRepoHead,
  resolveChanges,
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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("resolveChanges", () => {
  const compare: CompareCommits = async () => [
    { filePath: "B.tsx", removed: false },
    { filePath: "A.tsx", removed: false },
    { filePath: "Gone.tsx", removed: true },
    { filePath: "Renamed.tsx", removed: true },
    { filePath: "Renamed.tsx", removed: false },
  ];

  it("maps a comparison to changed and removed paths in order", async () => {
    const changeSet = await resolveChanges({
      previousHead: "aaa",
      head: "bbb",
      compare,
    });

    expect(changeSet.comparable).toBe(true);
    // Deletions are part of the trail (evidence + changesSincePrevious), not
    // only of the invalidation set.
    expect(changeSet.changes.map((change) => change.filePath)).toEqual([
      "A.tsx",
      "B.tsx",
      "Gone.tsx",
      "Renamed.tsx",
    ]);
    expect(changeSet.removed).toEqual(["Gone.tsx", "Renamed.tsx"]);
  });

  it("is comparable and empty when the commit did not move", async () => {
    const spy = vi.fn(compare);
    const changeSet = await resolveChanges({
      previousHead: "aaa",
      head: "aaa",
      compare: spy,
    });

    expect(changeSet).toEqual({
      changes: [],
      removed: [],
      comparable: true,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats a missing previous commit as not comparable", async () => {
    const changeSet = await resolveChanges({
      previousHead: undefined,
      head: "bbb",
      compare,
    });

    expect(changeSet.comparable).toBe(false);
    expect(changeSet.changes).toEqual([]);
  });

  it("treats a missing checkout head as not comparable", async () => {
    const changeSet = await resolveChanges({
      previousHead: "aaa",
      head: undefined,
      compare,
    });

    expect(changeSet.comparable).toBe(false);
  });

  it("treats an unavailable comparison as not comparable, never as no change", async () => {
    const changeSet = await resolveChanges({
      previousHead: "aaa",
      head: "bbb",
      compare: async () => null,
    });

    expect(changeSet).toEqual({
      changes: [],
      removed: [],
      comparable: false,
    });
  });
});

describe("summarizeChanges", () => {
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
});

describe("assertCheckoutQuota", () => {
  it("accepts a checkout inside the quota", async () => {
    await expect(assertCheckoutQuota(rootPath)).resolves.toBeUndefined();
  });

  it("fails when the checkout exceeds the file quota", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_FILES", "1");
    fs.writeFileSync(path.join(rootPath, "B.tsx"), "export {};\n");

    await expect(assertCheckoutQuota(rootPath)).rejects.toThrow(
      /assessment quota/,
    );
  });

  it("fails when the checkout exceeds the byte quota", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", "1");

    await expect(assertCheckoutQuota(rootPath)).rejects.toThrow(
      /assessment quota/,
    );
  });

  it("abandons the walk when it runs past its time budget", async () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_SCAN_MS", "1");
    let calls = 0;
    vi.spyOn(Date, "now").mockImplementation(() =>
      calls++ === 0 ? 1_000 : 100_000,
    );

    await expect(assertCheckoutQuota(rootPath)).rejects.toThrow(/timed out/);
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

    await expect(assertCheckoutQuota(rootPath)).resolves.toBeUndefined();
    spy.mockRestore();
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
