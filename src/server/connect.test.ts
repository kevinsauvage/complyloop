import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import {
  ConnectError,
  connectLocalPath,
  deriveProjectName,
  isLikelyGitUrl,
  setActiveProject,
} from "./connect";
import type { Db } from "./db";

function emptyDb(): Db {
  return {
    frameworks: [rgaaFramework],
    controls: rgaaControls,
    projects: [],
    activeProjectId: null,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
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
});
