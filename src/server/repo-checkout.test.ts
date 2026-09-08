import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

const clone = vi.hoisted(() => vi.fn());

vi.mock("./git", () => ({
  createGit: () => ({ clone }),
}));

import { cloneShallow, withFixtureCheckout, withProjectCheckout } from "./repo-checkout";

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
  clone.mockReset();
});

describe("cloneShallow", () => {
  it("delegates to git clone", async () => {
    clone.mockResolvedValue(undefined);
    const root = path.join(os.tmpdir(), `complyloop-clone-${Date.now()}`, "repo");
    tempDirs.push(path.dirname(root));
    await cloneShallow("https://example.com/r.git", root);
    expect(clone).toHaveBeenCalledWith("https://example.com/r.git", root, [
      "--depth",
      "1",
    ]);
  });

  it("removes the directory and wraps failures", async () => {
    clone.mockRejectedValue(new Error("auth failed"));
    const root = path.join(os.tmpdir(), `complyloop-clone-fail-${Date.now()}`, "repo");
    tempDirs.push(path.dirname(root));
    await expect(cloneShallow("https://example.com/r.git", root)).rejects.toBeInstanceOf(
      PublicError,
    );
    expect(fs.existsSync(root)).toBe(false);
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
    fs.writeFileSync(path.join(fixture, "Bad.tsx"), "export const Bad = () => null;\n");
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
