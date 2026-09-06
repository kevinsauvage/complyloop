import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@complyloop/db/types";
import { testProject } from "@/test-fixtures/project";
import { emptyDb } from "./db";

const clone = vi.hoisted(() => vi.fn());

vi.mock("./git", () => ({
  createGit: () => ({ clone }),
}));

import {
  addConnectedProject,
  assertAssessableRoot,
  cloneShallow,
  deriveProjectName,
  githubCloneUrl,
  uniqueProjectName,
} from "./connect-github";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  clone.mockReset();
});

describe("githubCloneUrl", () => {
  it("embeds an encoded token in the clone URL", () => {
    expect(githubCloneUrl("acme/app", "tok/en")).toBe(
      "https://x-access-token:tok%2Fen@github.com/acme/app.git",
    );
  });
});

describe("deriveProjectName", () => {
  it("uses the repo segment and sanitizes", () => {
    expect(deriveProjectName("acme/my app!!")).toBe("my-app");
    expect(deriveProjectName("acme/very-long-" + "x".repeat(100)).length).toBe(
      80,
    );
  });

  it("falls back when the name is empty after sanitizing", () => {
    expect(deriveProjectName("acme/@@@")).toBe("project");
    expect(deriveProjectName("")).toBe("project");
  });
});

describe("uniqueProjectName", () => {
  it("returns the desired name when free", () => {
    expect(uniqueProjectName(emptyDb(), "Shop")).toBe("Shop");
  });

  it("suffixes when taken", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "Shop",
      source: "github",
      orgId: "org-test",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    db.projects.push({
      id: "p2",
      name: "Shop-2",
      source: "github",
      orgId: "org-test",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(uniqueProjectName(db, "Shop")).toBe("Shop-3");
  });
});

describe("assertAssessableRoot", () => {
  it("rejects missing paths and files", () => {
    expect(() => assertAssessableRoot("/tmp/does-not-exist-complyloop")).toThrow(
      /does not exist/,
    );
    const file = path.join(os.tmpdir(), `complyloop-file-${Date.now()}`);
    fs.writeFileSync(file, "x");
    tempDirs.push(file);
    expect(() => assertAssessableRoot(file)).toThrow(/not a directory/);
  });

  it("rejects directories without source files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-empty-"));
    tempDirs.push(dir);
    expect(() => assertAssessableRoot(dir)).toThrow(/No \.tsx/);
  });

  it("accepts a directory with a tsx file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-src-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "App.tsx"), "export const A = 1;\n");
    expect(() => assertAssessableRoot(dir)).not.toThrow();
  });
});

describe("addConnectedProject", () => {
  it("pushes the project and records evidence", () => {
    const db = emptyDb();
    const project = testProject({
      github: { fullName: "acme/shop", defaultBranch: "main", private: false },
      sourceRef: "https://github.com/acme/shop",
    });

    expect(addConnectedProject(db, project, 'Connected "Shop"')).toBe(project);
    expect(db.projects).toHaveLength(1);
    expect(db.evidence.at(-1)).toMatchObject({
      kind: "project_connected",
      projectId: "p1",
      summary: 'Connected "Shop"',
    });
  });
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
