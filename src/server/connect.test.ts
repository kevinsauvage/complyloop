import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { ConnectError, isLikelyGitUrl } from "./connect-url";
import { connectLocalPath, connectProjectInput } from "./connect-local";
import { disconnectGitHubRepo, githubCloneUrl } from "./connect-github";
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

describe("deriveProjectName", () => {
  it("uses the last path segment for local paths and git URLs", () => {
    expect(deriveProjectName("/Users/me/apps/my-shop")).toBe("my-shop");
    expect(deriveProjectName("https://github.com/acme/my-shop.git")).toBe("my-shop");
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

    // uniqueWorkspacePath joins under workspacesDir — seed a collision there.
    const name = `uniq-${crypto.randomUUID().slice(0, 8)}`;
    const first = uniqueWorkspacePath(name);
    fs.mkdirSync(first, { recursive: true });
    tempDirs.push(first);
    const second = uniqueWorkspacePath(name);
    expect(second).toBe(`${first}-2`);

    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "shop",
      rootPath: "/tmp/a",
      source: "sample",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
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

describe("connectProjectInput", () => {
  it("routes local paths to connectLocalPath", async () => {
    const root = makeProjectDir({
      "App.tsx": `export const App = () => null;\n`,
    });
    const db = emptyDb();
    const project = await connectProjectInput(db, root);
    expect(project.source).toBe("local");
  });

  it("rejects empty input", async () => {
    await expect(connectProjectInput(emptyDb(), "  ")).rejects.toThrow(
      ConnectError,
    );
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

describe("connectLocalPath", () => {
  it("connects an assessable directory and makes it active", () => {
    const root = makeProjectDir({
      "src/App.tsx": `export const App = () => <img src="/x.png" />;\n`,
    });
    const db = emptyDb();
    const project = connectLocalPath(db, root);

    expect(project.source).toBe("local");
    expect(project.rootPath).toBe(path.resolve(root));
    expect(project.sourceRef).toBe(path.resolve(root));
    expect(db.activeProjectId).toBe(project.id);
    expect(db.evidence.some((record) => record.kind === "project_connected")).toBe(
      true,
    );
  });

  it("reuses an existing connection to the same path", () => {
    const root = makeProjectDir({
      "page.tsx": `export default () => <main />;`,
    });
    const db = emptyDb();
    const first = connectLocalPath(db, root);
    const second = connectLocalPath(db, root);
    expect(second.id).toBe(first.id);
    expect(db.projects).toHaveLength(1);
  });

  it("rejects missing paths and directories without source files", () => {
    const db = emptyDb();
    expect(() => connectLocalPath(db, "/no/such/path-xyz")).toThrow(ConnectError);

    const emptyDir = makeProjectDir({ "README.md": "# empty\n" });
    expect(() => connectLocalPath(db, emptyDir)).toThrow(/No .* source files/);
  });
});

describe("setActiveProject", () => {
  it("switches the active project", () => {
    const a = makeProjectDir({ "a.tsx": `export const A = () => null;` });
    const b = makeProjectDir({ "b.tsx": `export const B = () => null;` });
    const db = emptyDb();
    const projectA = connectLocalPath(db, a);
    const projectB = connectLocalPath(db, b);
    expect(db.activeProjectId).toBe(projectB.id);

    setActiveProject(db, projectA.id);
    expect(db.activeProjectId).toBe(projectA.id);
  });

  it("rejects unknown and inaccessible projects", () => {
    const root = makeProjectDir({ "a.tsx": `export const A = () => null;` });
    const db = emptyDb();
    const connected = connectLocalPath(db, root);
    connected.orgId = "org-secret";
    connected.ownerUserId = "owner-a";

    expect(() => setActiveProject(db, "missing")).toThrow(/Unknown project/);
    expect(() => setActiveProject(db, connected.id, "other-user")).toThrow(
      /do not have access/,
    );
  });
});

describe("disconnectGitHubRepo", () => {
  it("removes the project, workspace clone, and records evidence", () => {
    const sampleRoot = makeProjectDir({
      "sample.tsx": `export const S = () => null;`,
    });
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
      id: "sample",
      name: "sample-shop",
      rootPath: sampleRoot,
      source: "sample",
      createdAt: new Date().toISOString(),
    });
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

    expect(db.projects.map((project) => project.id)).toEqual(["sample"]);
    expect(db.activeProjectId).toBe("sample");
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
