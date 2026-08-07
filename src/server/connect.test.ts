import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/types";
import { isLikelyGitUrl } from "./connect-url";
import {
  connectedGitHubProjectsByFullName,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
  githubCloneUrl,
} from "./connect-github";
import { setActiveProject } from "./connect-active";
import {
  assertAssessableOrRemove,
  deriveProjectName,
  uniqueProjectName,
  uniqueWorkspacePath,
} from "./connect-shared";
import type { Db } from "./db";
import { workspacesDir } from "./db";

function emptyDb(): Db {
  return {
    frameworks: [rgaaFramework],
    controls: rgaaControls,
    organizations: [],
    memberships: [],
    projects: [],
    activeProjectId: null,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeProjectDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connect-test-"));
  tempDirs.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

function githubProject(
  partial: Pick<Project, "id" | "name" | "rootPath"> &
    Partial<Omit<Project, "id" | "name" | "rootPath" | "source">>,
): Project {
  return {
    source: "github",
    createdAt: "2026-01-01T00:00:00.000Z",
    github: {
      fullName: `${partial.name}/repo`,
      defaultBranch: "main",
      private: false,
    },
    ...partial,
  };
}

describe("deriveProjectName", () => {
  it("uses the last path segment for paths and git URLs", () => {
    expect(deriveProjectName("/Users/me/apps/my-shop")).toBe("my-shop");
    expect(deriveProjectName("https://github.com/acme/my-shop.git")).toBe(
      "my-shop",
    );
    expect(deriveProjectName("git@github.com:acme/my-shop.git")).toBe("my-shop");
  });

  it("falls back to project when the name would be empty", () => {
    expect(deriveProjectName("///")).toBe("project");
  });
});

describe("unique helpers", () => {
  it("allocates a free workspace path and project name", () => {
    const taken = makeProjectDir({ "x.tsx": "export {};" });
    const sibling = `${taken}-2`;
    fs.mkdirSync(sibling, { recursive: true });
    tempDirs.push(sibling);

    const name = `uniq-${crypto.randomUUID().slice(0, 8)}`;
    const first = uniqueWorkspacePath(name);
    fs.mkdirSync(first, { recursive: true });
    tempDirs.push(first);
    const second = uniqueWorkspacePath(name);
    expect(second).toBe(`${first}-2`);

    const db = emptyDb();
    db.projects.push(
      githubProject({ id: "p1", name: "shop", rootPath: "/tmp/a" }),
    );
    expect(uniqueProjectName(db, "shop")).toBe("shop-2");
    expect(uniqueProjectName(db, "fresh")).toBe("fresh");
  });
});

describe("assertAssessableOrRemove", () => {
  it("removes a non-assessable clone directory", () => {
    const root = makeProjectDir({ "README.md": "docs only\n" });
    expect(() => assertAssessableOrRemove(root)).toThrow(/No .* source files/);
    expect(fs.existsSync(root)).toBe(false);
  });
});

describe("githubCloneUrl", () => {
  it("embeds the token in an HTTPS clone URL", () => {
    expect(githubCloneUrl("acme/shop", "tok en")).toBe(
      "https://x-access-token:tok%20en@github.com/acme/shop.git",
    );
  });
});

describe("findConnectedGitHubProject", () => {
  const base = {
    id: "gh-1",
    name: "shop",
    rootPath: "/tmp/shop",
    source: "github" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    github: {
      fullName: "Acme/Shop",
      defaultBranch: "main",
      private: false,
    },
  };

  it("matches by owner even when active org differs", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-other" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", "user-a", "org-active"),
    ).toBe(project);
  });

  it("matches by active org when another member connected the repo", () => {
    const project = { ...base, ownerUserId: "user-b", orgId: "org-team" };
    expect(
      findConnectedGitHubProject([project], "ACME/SHOP", "user-a", "org-team"),
    ).toBe(project);
  });

  it("does not treat undefined orgId as matching a null active org for other users", () => {
    const project = { ...base, ownerUserId: "user-b" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", "user-a", null),
    ).toBeUndefined();
  });

  it("builds a lowercase fullName map for the picker", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-1" };
    expect(
      connectedGitHubProjectsByFullName([project], "user-a", "org-1"),
    ).toEqual({ "acme/shop": "gh-1" });
  });
});

describe("isLikelyGitUrl", () => {
  it("recognizes common git remotes and rejects bare paths", () => {
    expect(isLikelyGitUrl("https://github.com/acme/repo")).toBe(true);
    expect(isLikelyGitUrl("git@github.com:acme/repo.git")).toBe(true);
    expect(isLikelyGitUrl("/Users/me/apps/repo")).toBe(false);
    expect(isLikelyGitUrl("C:\\Users\\me\\apps\\repo")).toBe(false);
  });
});

describe("setActiveProject", () => {
  it("switches the active project", () => {
    const db = emptyDb();
    const projectA = githubProject({
      id: "a",
      name: "a",
      rootPath: "/tmp/a",
      ownerUserId: "user-a",
    });
    const projectB = githubProject({
      id: "b",
      name: "b",
      rootPath: "/tmp/b",
      ownerUserId: "user-a",
    });
    db.projects.push(projectA, projectB);
    db.activeProjectId = projectB.id;

    setActiveProject(db, projectA.id, "user-a");
    expect(db.activeProjectId).toBe(projectA.id);
  });

  it("rejects unknown and inaccessible projects", () => {
    const db = emptyDb();
    const connected = githubProject({
      id: "gh-1",
      name: "shop",
      rootPath: "/tmp/shop",
      orgId: "org-secret",
      ownerUserId: "owner-a",
    });
    db.projects.push(connected);
    db.activeProjectId = connected.id;

    expect(() => setActiveProject(db, "missing")).toThrow(/Unknown project/);
    expect(() => setActiveProject(db, connected.id, "other-user")).toThrow(
      /do not have access/,
    );
  });
});

describe("disconnectGitHubRepo", () => {
  it("removes the project, workspace clone, and records evidence", () => {
    const cloneRoot = path.join(
      workspacesDir(),
      `disconnect-test-${crypto.randomUUID()}`,
    );
    fs.mkdirSync(cloneRoot, { recursive: true });
    fs.writeFileSync(
      path.join(cloneRoot, "App.tsx"),
      `export const App = () => null;\n`,
    );
    tempDirs.push(cloneRoot);

    const db = emptyDb();
    db.projects.push({
      id: "gh-1",
      name: "shop",
      rootPath: cloneRoot,
      source: "github",
      sourceRef: "https://github.com/acme/shop",
      ownerUserId: "user-a",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
      createdAt: new Date().toISOString(),
    });
    db.activeProjectId = "gh-1";
    db.findings.push({
      id: "f1",
      projectId: "gh-1",
      controlId: "ctl-img-alt",
      assessmentId: "a1",
      checkId: "img-alt",
      status: "open",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "fail",
      location: {
        kind: "source",
        filePath: "App.tsx",
        line: 1,
        column: 1,
        snippet: "<x />",
        span: { start: 0, end: 1 },
      },
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });

    disconnectGitHubRepo(db, "gh-1", "user-a");

    expect(db.projects).toHaveLength(0);
    expect(db.activeProjectId).toBeNull();
    expect(db.findings).toHaveLength(0);
    expect(fs.existsSync(cloneRoot)).toBe(false);
    expect(
      db.evidence.some((record) => record.kind === "project_disconnected"),
    ).toBe(true);
  });

  it("rejects disconnecting another user's project", () => {
    const db = emptyDb();
    db.projects.push({
      id: "gh-1",
      name: "shop",
      rootPath: "/tmp/shop",
      source: "github",
      ownerUserId: "user-a",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
      createdAt: new Date().toISOString(),
    });
    expect(() => disconnectGitHubRepo(db, "gh-1", "user-b")).toThrow(
      /permission to disconnect/,
    );
  });
});
