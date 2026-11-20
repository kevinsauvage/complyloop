import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  commitFixBranch,
  createPullRequestViaApi,
  openPullRequestUrl,
} from "./fix-branch";
import { createOctokit } from "./github";

const createOctokitMock = vi.hoisted(() => vi.fn());

vi.mock("./github", async () => {
  const actual = await vi.importActual<typeof import("./github")>("./github");
  return { ...actual, createOctokit: createOctokitMock };
});

const FULL_NAME = "acme/shop";

interface FakeOctokit {
  rest: {
    repos: {
      get: ReturnType<typeof vi.fn>;
      getContent: ReturnType<typeof vi.fn>;
    };
    git: {
      getRef: ReturnType<typeof vi.fn>;
      getCommit: ReturnType<typeof vi.fn>;
      getTree: ReturnType<typeof vi.fn>;
      createBlob: ReturnType<typeof vi.fn>;
      createTree: ReturnType<typeof vi.fn>;
      createCommit: ReturnType<typeof vi.fn>;
      createRef: ReturnType<typeof vi.fn>;
      updateRef: ReturnType<typeof vi.fn>;
    };
    pulls: {
      list: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function ok<T>(data: T) {
  return { data } as never;
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function fakeOctokit(): FakeOctokit {
  return {
    rest: {
      repos: {
        get: vi.fn(async () =>
          ok({
            permissions: { push: true, admin: false },
            default_branch: "main",
          }),
        ),
        getContent: vi.fn(async ({ path }: { path: string }) =>
          ok({
            type: "file",
            encoding: "base64",
            content: base64(`<img src="/x.png" />\n// ${path}\n`),
          }),
        ),
      },
      git: {
        getRef: vi.fn(async () => ok({ object: { sha: "base-sha" } })),
        getCommit: vi.fn(async () => ok({ tree: { sha: "base-tree" } })),
        getTree: vi.fn(async () => ok({ truncated: false, tree: [] })),
        createBlob: vi.fn(async () => ok({ sha: "blob-sha" })),
        createTree: vi.fn(async () => ok({ sha: "new-tree" })),
        createCommit: vi.fn(async () => ok({ sha: "commit-sha" })),
        createRef: vi.fn(async () => ok({})),
        updateRef: vi.fn(async () => ok({})),
      },
      pulls: {
        list: vi.fn(async () => ok([])),
        create: vi.fn(async () =>
          ok({ html_url: "https://github.com/acme/shop/pull/1" }),
        ),
      },
    },
  };
}

function octokitWith(overrides: Partial<FakeOctokit["rest"]> = {}) {
  const fake = fakeOctokit();
  const merged = {
    rest: { ...fake.rest, ...overrides },
  } as FakeOctokit;
  createOctokitMock.mockReturnValue(merged);
  return merged;
}

const EDIT = {
  path: "Hero.tsx",
  oldText: '<img src="/x.png" />',
  newText: '<img src="/x.png" alt="X" />',
};

function commitInput(
  overrides: Partial<Parameters<typeof commitFixBranch>[0]> = {},
) {
  return {
    fullName: FULL_NAME,
    accessToken: "token",
    branch: "complyloop/fix-f1",
    base: "main",
    message: "fix: add alt text",
    edits: [EDIT],
    ...overrides,
  };
}

beforeEach(() => {
  createOctokitMock.mockReset();
});

describe("commitFixBranch", () => {
  it("creates a blob, tree, commit, and branch through the Git Data API", async () => {
    const octokit = octokitWith();

    const result = await commitFixBranch(commitInput());

    expect(createOctokit).toHaveBeenCalledWith("token");
    expect(octokit.rest.git.createBlob).toHaveBeenCalledWith({
      owner: "acme",
      repo: "shop",
      content: '<img src="/x.png" alt="X" />\n// Hero.tsx\n',
      encoding: "utf-8",
    });
    expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: "base-tree",
        tree: [
          { path: "Hero.tsx", mode: "100644", type: "blob", sha: "blob-sha" },
        ],
      }),
    );
    expect(octokit.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "fix: add alt text",
        parents: ["base-sha"],
      }),
    );
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "shop",
      ref: "refs/heads/complyloop/fix-f1",
      sha: "commit-sha",
    });
    expect(result).toEqual({
      branch: "complyloop/fix-f1",
      base: "main",
      commitSha: "commit-sha",
    });
  });

  it("fails closed when the App lost write access", async () => {
    const octokit = octokitWith({
      repos: {
        get: vi.fn(async () =>
          ok({ permissions: { push: false, admin: false } }),
        ),
        getContent: vi.fn(),
      },
    } as never);

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /no longer has write access/,
    );
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
  });

  it("reports a failed permission probe instead of writing", async () => {
    octokitWith({
      repos: {
        get: vi.fn(async () => {
          throw Object.assign(new Error("ghost"), { status: 404 });
        }),
        getContent: vi.fn(),
      },
    } as never);

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /Could not check write access/,
    );
  });

  it("falls back to the live default branch when the tracked branch is gone", async () => {
    const octokit = octokitWith();
    octokit.rest.git.getRef.mockImplementation(
      async ({ ref }: { ref: string }) => {
        if (ref === "refs/heads/release") {
          throw Object.assign(new Error("gone"), { status: 404 });
        }
        return ok({ object: { sha: "main-sha" } });
      },
    );
    octokit.rest.repos.get.mockResolvedValue(
      ok({ permissions: { push: true }, default_branch: "main" }),
    );

    const result = await commitFixBranch(commitInput({ base: "release" }));

    expect(result.base).toBe("main");
    expect(octokit.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: ["main-sha"] }),
    );
  });

  it("fails when neither the tracked nor the default branch exists", async () => {
    const octokit = octokitWith();
    octokit.rest.git.getRef.mockRejectedValue(
      Object.assign(new Error("gone"), { status: 404 }),
    );

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /does not exist/,
    );
    expect(octokit.rest.git.createBlob).not.toHaveBeenCalled();
  });

  it("fails closed when the patch no longer matches the base commit", async () => {
    const octokit = octokitWith();
    octokit.rest.repos.getContent.mockResolvedValue(
      ok({
        type: "file",
        encoding: "base64",
        content: base64("<img alt='moved' />\n"),
      }),
    );

    await expect(commitFixBranch(commitInput())).rejects.toThrow();
    expect(octokit.rest.git.createBlob).not.toHaveBeenCalled();
  });

  it("refuses to create a branch when the patch changes nothing", async () => {
    const octokit = octokitWith();

    await expect(
      commitFixBranch(
        commitInput({
          edits: [
            {
              path: "Hero.tsx",
              oldText: "// Hero.tsx",
              newText: "// Hero.tsx",
            },
          ],
        }),
      ),
    ).rejects.toThrow(/No changes to commit/);
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
  });

  it("applies several edits to the same file in one blob", async () => {
    const octokit = octokitWith();
    octokit.rest.repos.getContent.mockResolvedValue(
      ok({
        type: "file",
        encoding: "base64",
        content: base64('<a href="/a">A</a>\n<a href="/b">B</a>\n'),
      }),
    );

    await commitFixBranch(
      commitInput({
        edits: [
          { path: "Links.tsx", oldText: 'href="/a"', newText: 'href="/a-x"' },
          { path: "Links.tsx", oldText: 'href="/b"', newText: 'href="/b-x"' },
        ],
      }),
    );

    expect(octokit.rest.git.createBlob).toHaveBeenCalledOnce();
    expect(octokit.rest.git.createBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<a href="/a-x">A</a>\n<a href="/b-x">B</a>\n',
      }),
    );
  });

  it("resets an existing fix branch when the ref already exists", async () => {
    const octokit = octokitWith();
    octokit.rest.git.createRef.mockRejectedValue(
      Object.assign(new Error("exists"), { status: 422 }),
    );

    const result = await commitFixBranch(commitInput());

    expect(octokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "shop",
      ref: "refs/heads/complyloop/fix-f1",
      sha: "commit-sha",
      force: true,
    });
    expect(result.commitSha).toBe("commit-sha");
  });

  it("propagates an unexpected ref-creation failure", async () => {
    const octokit = octokitWith();
    octokit.rest.git.createRef.mockRejectedValue(
      Object.assign(new Error("boom"), { status: 500 }),
    );

    await expect(commitFixBranch(commitInput())).rejects.toThrow("boom");
    expect(octokit.rest.git.updateRef).not.toHaveBeenCalled();
  });

  it("keeps the executable bit from the base tree", async () => {
    const octokit = octokitWith();
    octokit.rest.git.getTree.mockResolvedValue(
      ok({
        truncated: false,
        tree: [{ type: "blob", path: "Hero.tsx", mode: "100755" }],
      }),
    );

    await commitFixBranch(commitInput());

    expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [expect.objectContaining({ path: "Hero.tsx", mode: "100755" })],
      }),
    );
  });

  it("walks parent trees when the recursive listing is truncated", async () => {
    const octokit = octokitWith();
    const calls: string[] = [];
    octokit.rest.git.getTree.mockImplementation(
      async ({ tree_sha }: { tree_sha: string }) => {
        calls.push(tree_sha);
        if (calls.length === 1) {
          // Only the first (recursive) listing is truncated.
          return ok({ truncated: true, tree: [] });
        }
        return ok({
          tree: [
            { path: "Hero.tsx", type: "blob", mode: "100755", sha: "blob" },
          ],
        });
      },
    );

    await commitFixBranch(commitInput());

    expect(calls).toEqual(["base-tree", "base-tree"]);
    expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [expect.objectContaining({ mode: "100755" })],
      }),
    );
  });

  it("falls back to the plain file mode when the tree read fails", async () => {
    const octokit = octokitWith();
    octokit.rest.git.getTree.mockRejectedValue(new Error("rate limited"));

    await commitFixBranch(commitInput());

    expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [expect.objectContaining({ mode: "100644" })],
      }),
    );
  });
});

describe("readFileText failures", () => {
  function withContent(overrides: Record<string, unknown>) {
    const octokit = octokitWith();
    octokit.rest.repos.getContent.mockResolvedValue(ok(overrides));
    return octokit;
  }

  it("names a missing file", async () => {
    const octokit = octokitWith();
    octokit.rest.repos.getContent.mockRejectedValue(
      Object.assign(new Error("nope"), { status: 404 }),
    );

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /File not found in acme\/shop/,
    );
  });

  it("reports other read failures with the GitHub message", async () => {
    octokitWith();
    const octokit = octokitWith();
    octokit.rest.repos.getContent.mockRejectedValue(
      Object.assign(new Error("server exploded"), { status: 500 }),
    );

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /Could not read Hero.tsx/,
    );
  });

  it("rejects a reference that points at a directory", async () => {
    withContent({ type: "dir", encoding: "base64", content: "" });

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /Not a file in acme\/shop/,
    );
  });

  it("rejects a file GitHub will not inline", async () => {
    withContent({ type: "file", encoding: "none", content: undefined });

    await expect(commitFixBranch(commitInput())).rejects.toThrow(
      /Could not read the full contents/,
    );
  });
});

describe("openPullRequestUrl", () => {
  it("returns the open pull request targeting the head branch", async () => {
    const octokit = octokitWith();
    octokit.rest.pulls.list.mockResolvedValue(
      ok([
        {
          html_url: "https://github.com/acme/shop/pull/7",
          base: { ref: "main" },
        },
      ]),
    );

    await expect(
      openPullRequestUrl({
        fullName: FULL_NAME,
        accessToken: "token",
        head: "complyloop/fix-f1",
      }),
    ).resolves.toEqual({
      url: "https://github.com/acme/shop/pull/7",
      base: "main",
    });
  });

  it("returns null when there is no open pull request or the call fails", async () => {
    const octokit = octokitWith();
    octokit.rest.pulls.list.mockResolvedValue(ok([]));

    await expect(
      openPullRequestUrl({
        fullName: FULL_NAME,
        accessToken: "token",
        head: "complyloop/fix-f1",
      }),
    ).resolves.toBeNull();

    octokit.rest.pulls.list.mockRejectedValue(new Error("down"));
    await expect(
      openPullRequestUrl({
        fullName: FULL_NAME,
        accessToken: "token",
        head: "complyloop/fix-f1",
      }),
    ).resolves.toBeNull();
  });
});

describe("createPullRequestViaApi", () => {
  const input = {
    fullName: FULL_NAME,
    accessToken: "token",
    head: "complyloop/fix-f1",
    base: "main",
    title: "Add alt text",
    body: "Closes the finding.",
  };

  it("opens a draft pull request", async () => {
    const octokit = octokitWith();

    await expect(createPullRequestViaApi(input)).resolves.toBe(
      "https://github.com/acme/shop/pull/1",
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true, base: "main" }),
    );
  });

  it("reconciles with an existing pull request for the same base", async () => {
    const octokit = octokitWith();
    octokit.rest.pulls.create.mockRejectedValue(
      Object.assign(new Error("already exists"), { status: 422 }),
    );
    octokit.rest.pulls.list.mockResolvedValue(
      ok([
        {
          html_url: "https://github.com/acme/shop/pull/9",
          base: { ref: "main" },
        },
      ]),
    );

    await expect(createPullRequestViaApi(input)).resolves.toBe(
      "https://github.com/acme/shop/pull/9",
    );
  });

  it("rethrows when the existing pull request targets another base", async () => {
    const octokit = octokitWith();
    octokit.rest.pulls.create.mockRejectedValue(
      Object.assign(new Error("exists"), { status: 422 }),
    );
    octokit.rest.pulls.list.mockResolvedValue(
      ok([
        {
          html_url: "https://github.com/acme/shop/pull/9",
          base: { ref: "next" },
        },
      ]),
    );

    await expect(createPullRequestViaApi(input)).rejects.toThrow(
      /GitHub PR API failed/,
    );
  });

  it("rejects a successful response with no URL", async () => {
    const octokit = octokitWith();
    octokit.rest.pulls.create.mockResolvedValue(ok({ html_url: null }));
    octokit.rest.pulls.list.mockResolvedValue(ok([]));

    await expect(createPullRequestViaApi(input)).rejects.toThrow(/no html_url/);
  });
});

describe("fix branch error types", () => {
  it("surfaces a PublicError for a malformed repository name", async () => {
    octokitWith();

    await expect(
      commitFixBranch(commitInput({ fullName: "not-a-repo" })),
    ).rejects.toBeInstanceOf(PublicError);
  });
});
