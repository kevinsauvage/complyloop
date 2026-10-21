import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { testProject } from "@/test-fixtures/project";

import {
  readProjectFile,
  withProjectFileWorkspace,
} from "./single-file-source";

const getContentMock = vi.hoisted(() => vi.fn());
const tokenMock = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
const harnessMock = vi.hoisted(() => vi.fn(() => false));
const fixtureCheckoutMock = vi.hoisted(() =>
  vi.fn(async <T>(fn: (rootPath: string) => Promise<T>): Promise<T> =>
    fn("/fixture-root"),
  ),
);

vi.mock("./fixture-checkout", () => ({
  withFixtureCheckout: <T>(fn: (rootPath: string) => Promise<T>) =>
    fixtureCheckoutMock(fn),
}));

vi.mock("../e2e-harness", () => ({
  isE2EHarnessEnabled: () => harnessMock(),
}));

vi.mock("../github/github-access", () => ({
  resolveProjectGitHubToken: tokenMock,
}));

vi.mock("../github/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../github/github")>();
  return {
    ...actual,
    createOctokit: () => ({
      rest: { repos: { getContent: getContentMock } },
    }),
  };
});

function base64(text: string) {
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from(text).toString("base64"),
  };
}

const project: Project = testProject({
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    trackedBranch: "develop",
    private: false,
  },
});

function fileResponse(text: string) {
  return { data: base64(text) };
}

beforeEach(() => {
  getContentMock.mockReset();
  tokenMock.mockReset();
  tokenMock.mockResolvedValue("token");
  harnessMock.mockReset();
  harnessMock.mockReturnValue(false);
  fixtureCheckoutMock.mockClear();
});

describe("readProjectFile", () => {
  it("reads the file at the project's tracked branch", async () => {
    getContentMock.mockResolvedValue(fileResponse("<button />"));

    await expect(readProjectFile(project, "src/Hero.tsx")).resolves.toBe(
      "<button />",
    );
    expect(getContentMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "shop",
      path: "src/Hero.tsx",
      ref: "develop",
    });
  });

  it("fails loud when the file is missing", async () => {
    getContentMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(readProjectFile(project, "src/Gone.tsx")).rejects.toThrow(
      /Could not read src\/Gone.tsx from acme\/shop/,
    );
  });

  it("rejects a directory response", async () => {
    getContentMock.mockResolvedValue({ data: [{ type: "file" }] });

    await expect(readProjectFile(project, "src")).rejects.toThrow(/Not a file/);
  });

  it("fails loud without a GitHub token", async () => {
    tokenMock.mockResolvedValue(null);

    await expect(readProjectFile(project, "src/Hero.tsx")).rejects.toThrow(
      /not connected via the GitHub App|installation token/,
    );
    expect(getContentMock).not.toHaveBeenCalled();
  });
});

describe("withProjectFileWorkspace", () => {
  it("materialises the file at its relative path and cleans up", async () => {
    getContentMock.mockResolvedValue(fileResponse("<button />"));
    let seenRoot = "";

    await withProjectFileWorkspace(
      project,
      "src/components/Hero.tsx",
      async (rootPath) => {
        seenRoot = rootPath;
        expect(
          fs.readFileSync(
            path.join(rootPath, "src/components/Hero.tsx"),
            "utf8",
          ),
        ).toBe("<button />");
      },
    );

    expect(seenRoot).not.toBe("");
    expect(fs.existsSync(seenRoot)).toBe(false);
  });

  it("uses the fixture root under the e2e harness", async () => {
    harnessMock.mockReturnValue(true);
    let seenRoot = "";

    await withProjectFileWorkspace(
      project,
      "src/Hero.tsx",
      async (rootPath) => {
        seenRoot = rootPath;
        return Promise.resolve();
      },
    );

    expect(seenRoot).toBe("/fixture-root");
    expect(fixtureCheckoutMock).toHaveBeenCalled();
    expect(getContentMock).not.toHaveBeenCalled();
  });
});
