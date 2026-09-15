import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

const isoClone = vi.hoisted(() => vi.fn());
const isoFetch = vi.hoisted(() => vi.fn());
const isoCheckout = vi.hoisted(() => vi.fn());

vi.mock("isomorphic-git", () => ({
  default: {
    clone: (...args: unknown[]) => isoClone(...args),
    fetch: (...args: unknown[]) => isoFetch(...args),
    checkout: (...args: unknown[]) => isoCheckout(...args),
  },
}));

vi.mock("isomorphic-git/http/node", () => ({
  default: {},
}));

import {
  assertCheckoutWithinQuota,
  cloneAuthedShallow,
  cloneShallow,
  parseCheckoutRef,
  withFixtureCheckout,
  withProjectCheckout,
  withRepoCheckout,
} from "./repo-checkout";

const previousEnabled = process.env.E2E_AUTH_ENABLED;
const previousRoot = process.env.E2E_FIXTURE_ROOT;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (previousEnabled === undefined) delete process.env.E2E_AUTH_ENABLED;
  else process.env.E2E_AUTH_ENABLED = previousEnabled;
  if (previousRoot === undefined) delete process.env.E2E_FIXTURE_ROOT;
  else process.env.E2E_FIXTURE_ROOT = previousRoot;
  isoClone.mockReset();
  isoFetch.mockReset();
  isoCheckout.mockReset();
});

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`x-access-token:${token}`, "utf8").toString("base64")}`;
}

describe("cloneShallow", () => {
  it("delegates to a shallow single-branch clone", async () => {
    isoClone.mockResolvedValue(undefined);
    const root = path.join(
      os.tmpdir(),
      `complyloop-clone-${Date.now()}`,
      "repo",
    );
    tempDirs.push(path.dirname(root));
    await cloneShallow("https://example.com/r.git", root);
    expect(isoClone).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/r.git",
        dir: root,
        depth: 1,
        singleBranch: true,
      }),
    );
  });

  it("removes the directory and wraps failures", async () => {
    isoClone.mockRejectedValue(new Error("auth failed"));
    const root = path.join(
      os.tmpdir(),
      `complyloop-clone-fail-${Date.now()}`,
      "repo",
    );
    tempDirs.push(path.dirname(root));
    await expect(
      cloneShallow("https://example.com/r.git", root),
    ).rejects.toBeInstanceOf(PublicError);
    expect(fs.existsSync(root)).toBe(false);
  });

  it("redacts embedded credentials from clone failure output", async () => {
    const token = "gho_secret_token";
    isoClone.mockRejectedValue(
      new Error(
        `fatal: unable to access 'https://x-access-token:${token}@github.com/octo/repo.git/': The requested URL returned error: 403`,
      ),
    );
    const root = path.join(
      os.tmpdir(),
      `complyloop-clone-leak-${Date.now()}`,
      "repo",
    );
    tempDirs.push(path.dirname(root));
    const error = await cloneShallow("https://example.com/r.git", root).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(PublicError);
    expect((error as Error).message).not.toContain(token);
    expect((error as Error).message).not.toContain("x-access-token:");
    expect((error as Error).message).toContain("git clone failed:");
  });
});

describe("withFixtureCheckout", () => {
  it("runs against a copy so mutations do not touch the fixture", async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-src-"));
    tempDirs.push(fixture);
    fs.writeFileSync(path.join(fixture, "App.tsx"), "export const A = 1;\n");

    process.env.E2E_AUTH_ENABLED = "1";
    process.env.E2E_FIXTURE_ROOT = fixture;

    await withFixtureCheckout(async (rootPath) => {
      expect(rootPath).not.toBe(fixture);
      expect(fs.readFileSync(path.join(rootPath, "App.tsx"), "utf8")).toContain(
        "export const A",
      );
      fs.writeFileSync(path.join(rootPath, "App.tsx"), "mutated\n");
    });

    expect(fs.readFileSync(path.join(fixture, "App.tsx"), "utf8")).toBe(
      "export const A = 1;\n",
    );
  });

  it("withProjectCheckout uses the fixture when the harness is on", async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-src-"));
    tempDirs.push(fixture);
    fs.writeFileSync(
      path.join(fixture, "Bad.tsx"),
      "export const Bad = () => null;\n",
    );
    process.env.E2E_AUTH_ENABLED = "1";
    process.env.E2E_FIXTURE_ROOT = fixture;

    const seen = await withProjectCheckout(
      {
        id: "p1",
        name: "sample",
        source: "github",
        orgId: "org-test",
        createdAt: "2026-01-01T00:00:00.000Z",
        github: {
          fullName: "e2e/sample-app",
          defaultBranch: "main",
          private: false,
        },
      },
      async (rootPath) => fs.existsSync(path.join(rootPath, "Bad.tsx")),
    );
    expect(seen).toBe(true);
  });
});

describe("parseCheckoutRef", () => {
  it("accepts commit SHAs and plain branch names", () => {
    expect(parseCheckoutRef("abc1234")).toBe("abc1234");
    expect(parseCheckoutRef("0123456789abcdef0123456789abcdef01234567")).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
    expect(parseCheckoutRef("main")).toBe("main");
    expect(parseCheckoutRef("feature/my-branch_v2.1")).toBe(
      "feature/my-branch_v2.1",
    );
  });

  it("rejects flag-injection and malformed refs", () => {
    for (const ref of [
      "--upload-pack=touch pwned",
      "--upload-pack=id",
      "-h",
      "feature branch",
      "main\ncheckout evil",
      "",
      "/etc/passwd",
      "..",
      "feature/../evil",
      "branch.lock",
      "branch/",
      "refs/heads/main@{1}",
    ]) {
      expect(() => parseCheckoutRef(ref)).toThrow(PublicError);
    }
  });

  it("withRepoCheckout rejects a malicious ref before cloning", async () => {
    delete process.env.E2E_AUTH_ENABLED;
    await expect(
      withRepoCheckout(
        { fullName: "o/r", accessToken: "token", ref: "--upload-pack=id" },
        async () => "unreached",
      ),
    ).rejects.toBeInstanceOf(PublicError);
    expect(isoClone).not.toHaveBeenCalled();
  });

  it("withRepoCheckout clones the public URL and authenticates via header, not URL", async () => {
    delete process.env.E2E_AUTH_ENABLED;
    isoClone.mockResolvedValue(undefined);
    isoFetch.mockResolvedValue(undefined);
    isoCheckout.mockResolvedValue(undefined);
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = await withRepoCheckout(
      { fullName: "octo/repo", accessToken: "ghs_secret", ref: sha },
      async () => "done",
    );
    expect(result).toBe("done");
    expect(isoClone).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://github.com/octo/repo.git",
        depth: 1,
        singleBranch: true,
        headers: { Authorization: basicAuth("ghs_secret") },
      }),
    );
    const cloneUrl = isoClone.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(cloneUrl.url as string).not.toContain("ghs_secret");
    expect(cloneUrl.url as string).not.toContain("x-access-token");
    expect(isoFetch).toHaveBeenCalledWith(
      expect.objectContaining({ ref: sha, depth: 1 }),
    );
    expect(isoCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ ref: sha }),
    );
  });

  it("withRepoCheckout maps unknown refs to ref_not_found", async () => {
    delete process.env.E2E_AUTH_ENABLED;
    isoClone.mockResolvedValue(undefined);
    isoFetch.mockRejectedValue(
      Object.assign(new Error("Could not find gone-branch."), {
        code: "NotFoundError",
      }),
    );
    await expect(
      withRepoCheckout(
        { fullName: "octo/repo", accessToken: "tok", ref: "gone-branch" },
        async () => "unreached",
      ),
    ).rejects.toMatchObject({ code: "ref_not_found" });
  });

  it("withRepoCheckout rethrows non-ref fetch failures", async () => {
    delete process.env.E2E_AUTH_ENABLED;
    isoClone.mockResolvedValue(undefined);
    isoFetch.mockRejectedValue(new Error("HTTP Error: 401 Unauthorized"));
    await expect(
      withRepoCheckout(
        { fullName: "octo/repo", accessToken: "tok", ref: "main" },
        async () => "unreached",
      ),
    ).rejects.toThrow(/401/);
  });

  it("cloneAuthedShallow delegates with the token in the auth header", async () => {
    isoClone.mockResolvedValue(undefined);
    const root = path.join(
      os.tmpdir(),
      `complyloop-authed-${Date.now()}`,
      "repo",
    );
    tempDirs.push(path.dirname(root));
    await cloneAuthedShallow("https://github.com/o/r.git", "tok", root);
    expect(isoClone).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://github.com/o/r.git",
        dir: root,
        headers: { Authorization: basicAuth("tok") },
      }),
    );
  });
});

describe("assertCheckoutWithinQuota", () => {
  const envKeys = [
    "ASSESSMENT_MAX_CHECKOUT_BYTES",
    "ASSESSMENT_MAX_CHECKOUT_FILES",
  ] as const;
  const originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof envKeys)[number], string | undefined>;

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("allows an empty tree", async () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "10";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-empty-"));
    tempDirs.push(root);
    await expect(assertCheckoutWithinQuota(root)).resolves.toBeUndefined();
  });

  it("counts files across nested directories, ignoring .git", async () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "2";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-nested-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(root, "a", "one.ts"), "1");
    fs.writeFileSync(path.join(root, "a", "b", "two.ts"), "2");
    fs.mkdirSync(path.join(root, ".git", "objects"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".git", "objects", "pack"),
      "x".repeat(100),
    );
    await expect(assertCheckoutWithinQuota(root)).resolves.toBeUndefined();

    fs.writeFileSync(path.join(root, "a", "b", "three.ts"), "3");
    await expect(assertCheckoutWithinQuota(root)).rejects.toThrow(
      /assessment quota/,
    );
  });

  it("allows trees within the quota", async () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "10";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-ok-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    await expect(assertCheckoutWithinQuota(root)).resolves.toBeUndefined();
  });

  it("rejects when file count exceeds the quota", async () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "1";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = String(1024 * 1024);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-files-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "one.ts"), "1");
    fs.writeFileSync(path.join(root, "two.ts"), "2");
    await expect(assertCheckoutWithinQuota(root)).rejects.toBeInstanceOf(
      PublicError,
    );
    await expect(assertCheckoutWithinQuota(root)).rejects.toThrow(
      /assessment quota/,
    );
  });

  it("rejects when byte size exceeds the quota", async () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "10";
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "8";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "quota-bytes-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "big.txt"), "0123456789");
    await expect(assertCheckoutWithinQuota(root)).rejects.toThrow(
      /assessment quota/,
    );
  });
});
