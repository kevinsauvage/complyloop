import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Db } from "./db";

const clone = vi.hoisted(() => vi.fn());

vi.mock("./git", () => ({
  createGit: () => ({ clone }),
}));

import { ConnectError } from "./connect-url";
import { connectGitUrl, connectProjectInput } from "./connect-local";

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
  clone.mockReset();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("connectGitUrl", () => {
  it("clones a remote and connects the workspace", async () => {
    clone.mockImplementation(async (_url: string, rootPath: string) => {
      fs.mkdirSync(rootPath, { recursive: true });
      fs.writeFileSync(
        path.join(rootPath, "App.tsx"),
        `export const App = () => null;\n`,
      );
      tempDirs.push(rootPath);
    });

    const db = emptyDb();
    const project = await connectGitUrl(
      db,
      "https://github.com/acme/demo-repo.git",
    );

    expect(project.source).toBe("git");
    expect(project.sourceRef).toBe("https://github.com/acme/demo-repo.git");
    expect(db.activeProjectId).toBe(project.id);
    expect(clone).toHaveBeenCalledOnce();
  });

  it("maps clone failures to ConnectError", async () => {
    clone.mockRejectedValue(new Error("network down"));
    await expect(
      connectGitUrl(emptyDb(), "https://github.com/acme/fail.git"),
    ).rejects.toThrow(/git clone failed/);
  });

  it("rejects empty URLs", async () => {
    await expect(connectGitUrl(emptyDb(), "  ")).rejects.toThrow(ConnectError);
  });
});

describe("connectProjectInput git routing", () => {
  it("routes git URLs through connectGitUrl", async () => {
    clone.mockImplementation(async (_url: string, rootPath: string) => {
      fs.mkdirSync(rootPath, { recursive: true });
      fs.writeFileSync(path.join(rootPath, "page.tsx"), `export default () => null;\n`);
      tempDirs.push(rootPath);
    });

    const project = await connectProjectInput(
      emptyDb(),
      "https://github.com/acme/routed.git",
    );
    expect(project.source).toBe("git");
  });
});
