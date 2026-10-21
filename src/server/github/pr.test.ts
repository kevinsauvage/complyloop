import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import type { PatchCandidate } from "@/ai/verified-fix";
import { testProject } from "@/test-fixtures/project";

import { preparePullRequest } from "./pr";

/**
 * The only network edge is the GitHub REST API, so the tests drive an
 * in-memory repository through the mocked Octokit client: refs, blobs, trees,
 * commits, branches and PRs behave like the real API where the code depends
 * on it, and every call is asserted against the recorded state.
 */
const hub = vi.hoisted(() => {
  const state = {
    files: new Map<string, string>(),
    fileModes: new Map<string, string>(),
    refs: new Map<string, string>(),
    defaultBranch: "main",
    blobs: [] as string[],
    treeEntries: [] as Array<
      Array<{ path: string; mode: string; type: string; sha: string }>
    >,
    commits: [] as Array<{
      message: string;
      tree: string;
      parents: string[];
    }>,
    createdBranches: [] as string[],
    updatedBranches: [] as Array<{ ref: string; force?: boolean }>,
    openPrs: [] as Array<{ html_url: string; base: { ref: string } }>,
    treeTruncated: false,
    failPrCreate: false,
    prCreateArgs: [] as Array<{
      head: string;
      base: string;
      draft?: boolean;
      body?: string;
    }>,
  };

  const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

  const octokit = {
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: state.defaultBranch } }),
        getContent: async (args: { path: string }) => {
          const text = state.files.get(args.path);
          if (text === undefined) throw notFound();
          return {
            data: {
              type: "file",
              encoding: "base64",
              content: Buffer.from(text, "utf8").toString("base64"),
            },
          };
        },
      },
      git: {
        getRef: async (args: { ref: string }) => {
          const sha = state.refs.get(args.ref);
          if (!sha) throw notFound();
          return { data: { object: { sha } } };
        },
        getCommit: async () => ({
          data: { tree: { sha: "base-tree-sha" } },
        }),
        getTree: async (args: { tree_sha: string; recursive?: string }) => {
          const treeForDir = (dir: string) => {
            const prefix = dir ? `${dir}/` : "";
            const entries: Array<{
              path: string;
              mode: string;
              type: string;
              sha?: string;
            }> = [];
            const seenDirs = new Set<string>();
            for (const filePath of state.files.keys()) {
              if (!filePath.startsWith(prefix)) continue;
              const [head, ...rest] = filePath.slice(prefix.length).split("/");
              if (!head) continue;
              if (rest.length === 0) {
                entries.push({
                  path: head,
                  mode: state.fileModes.get(filePath) ?? "100644",
                  type: "blob",
                  sha: `blob:${filePath}`,
                });
              } else if (!seenDirs.has(head)) {
                seenDirs.add(head);
                entries.push({
                  path: head,
                  mode: "040000",
                  type: "tree",
                  sha: `dir:${prefix}${head}`,
                });
              }
            }
            return entries;
          };
          if (args.recursive) {
            return {
              data: {
                truncated: state.treeTruncated,
                tree: state.treeTruncated
                  ? []
                  : [...state.files.keys()].map((filePath) => ({
                      path: filePath,
                      mode: state.fileModes.get(filePath) ?? "100644",
                      type: "blob",
                      sha: `blob:${filePath}`,
                    })),
              },
            };
          }
          const dir =
            args.tree_sha === "base-tree-sha"
              ? ""
              : args.tree_sha.startsWith("dir:")
                ? args.tree_sha.slice(4)
                : "";
          return { data: { truncated: false, tree: treeForDir(dir) } };
        },
        createBlob: async (args: { content: string }) => {
          state.blobs.push(args.content);
          return { data: { sha: `blob-${state.blobs.length}` } };
        },
        createTree: async (args: {
          tree: Array<{
            path: string;
            mode: string;
            type: string;
            sha: string;
          }>;
        }) => {
          state.treeEntries.push(args.tree);
          return { data: { sha: `tree-${state.treeEntries.length}` } };
        },
        createCommit: async (args: {
          message: string;
          tree: string;
          parents: string[];
        }) => {
          state.commits.push(args);
          return { data: { sha: `commit-${state.commits.length}` } };
        },
        createRef: async (args: { ref: string; sha: string }) => {
          if (state.refs.has(args.ref)) {
            throw Object.assign(new Error("Reference already exists"), {
              status: 422,
            });
          }
          state.refs.set(args.ref, args.sha);
          state.createdBranches.push(args.ref);
          return { data: {} };
        },
        updateRef: async (args: {
          ref: string;
          sha: string;
          force?: boolean;
        }) => {
          state.refs.set(args.ref, args.sha);
          state.updatedBranches.push({ ref: args.ref, force: args.force });
          return { data: {} };
        },
      },
      pulls: {
        list: async () => ({ data: state.openPrs }),
        create: async (args: {
          head: string;
          base: string;
          draft?: boolean;
          body?: string;
        }) => {
          if (state.failPrCreate) throw new Error("API down");
          state.prCreateArgs.push(args);
          return {
            data: { html_url: "https://github.com/acme/shop/pull/42" },
          };
        },
      },
    },
  };

  return {
    state,
    octokit,
    reset() {
      state.files = new Map([
        ["src/Hero.tsx", "export const Hero = () => <button></button>;\n"],
      ]);
      state.refs = new Map([["refs/heads/main", "base-sha"]]);
      state.fileModes = new Map([["src/Hero.tsx", "100644"]]);
      state.defaultBranch = "main";
      state.blobs.length = 0;
      state.treeEntries.length = 0;
      state.commits.length = 0;
      state.createdBranches.length = 0;
      state.updatedBranches.length = 0;
      state.openPrs.length = 0;
      state.treeTruncated = false;
      state.failPrCreate = false;
      state.prCreateArgs.length = 0;
    },
  };
});

const tokenMock = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock("./github-access", () => ({ resolveProjectGitHubToken: tokenMock }));

vi.mock("./github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./github")>();
  return { ...actual, createOctokit: () => hub.octokit };
});

const PROJECT: Project = testProject({
  name: "shop",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

const CONTROL: Control = {
  id: "ctl-button-name",
  frameworkId: "fw",
  code: "WCAG 4.1.2",
  secondaryCode: "RGAA 11.9",
  title: "Buttons have an accessible name",
  description: "Every button exposes a name describing its action.",
  checkId: "button-name",
};

const FINDING: Finding = {
  id: "f1",
  projectId: PROJECT.id,
  controlId: CONTROL.id,
  assessmentId: "a1",
  checkId: "button-name",
  status: "open",
  kind: "violation",
  severity: "serious",
  confidence: "high",
  reason: "Button has no accessible name",
  location: {
    kind: "source",
    filePath: "src/Hero.tsx",
    line: 1,
    column: 28,
    snippet: "<button></button>",
    span: { start: 27, end: 45 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const REMEDIATION: Remediation = {
  id: "r1",
  findingId: FINDING.id,
  status: "approved",
  suggestion: {
    description: "Add alt",
    proposedSnippet: '<button aria-label="Save"></button>',
    provenance: "deterministic",
  },
  history: [],
};

const CANDIDATE: PatchCandidate = {
  description: "Add alt",
  provenance: "deterministic",
  edits: [
    {
      path: "src/Hero.tsx",
      oldText: "<button></button>",
      newText: '<button aria-label="Save"></button>',
    },
  ],
  complyLoop: { passed: true, remaining: [] },
};

const BRANCH = "complyloop/fix-button-name-f1";

function run(
  candidate: PatchCandidate | null = CANDIDATE,
  finding: Finding = FINDING,
  project: Project = PROJECT,
) {
  return preparePullRequest(project, CONTROL, finding, REMEDIATION, candidate);
}

beforeEach(() => {
  hub.reset();
  tokenMock.mockReset();
  tokenMock.mockResolvedValue("token");
});

describe("preparePullRequest", () => {
  it("commits the verified edit through the Git Data API and opens a draft PR", async () => {
    const result = await run();

    expect(result.branch).toBe(BRANCH);
    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/42");
    expect(result.message).toMatch(/Draft pull request created/);

    expect(hub.state.blobs).toHaveLength(1);
    expect(hub.state.blobs[0]).toContain('aria-label="Save"');
    expect(hub.state.treeEntries[0]).toEqual([
      { path: "src/Hero.tsx", mode: "100644", type: "blob", sha: "blob-1" },
    ]);
    expect(hub.state.commits[0]).toMatchObject({
      tree: "tree-1",
      parents: ["base-sha"],
    });
    expect(hub.state.commits[0]?.message).toContain("fix(a11y)");
    expect(hub.state.createdBranches).toEqual([`refs/heads/${BRANCH}`]);
    expect(hub.state.prCreateArgs[0]).toMatchObject({
      head: BRANCH,
      base: "main",
      draft: true,
    });
    expect(hub.state.prCreateArgs[0]?.body).toContain(
      "Repository tests run in GitHub CI",
    );
  });

  it("resets an existing fix branch instead of failing the retry", async () => {
    hub.state.refs.set(`refs/heads/${BRANCH}`, "previous-run-sha");

    const result = await run();

    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/42");
    expect(hub.state.createdBranches).toEqual([]);
    expect(hub.state.updatedBranches).toEqual([
      { ref: `refs/heads/${BRANCH}`, force: true },
    ]);
  });

  it("reuses an open PR without creating another", async () => {
    hub.state.openPrs = [
      {
        html_url: "https://github.com/acme/shop/pull/7",
        base: { ref: "main" },
      },
    ];

    const result = await run();

    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/7");
  });

  it("refuses to reuse an open PR that targets another base", async () => {
    hub.state.openPrs = [
      {
        html_url: "https://github.com/acme/shop/pull/9",
        base: { ref: "release" },
      },
    ];

    await expect(run()).rejects.toThrow(/targets `release`, not `main`/);
    // Nothing is committed before the mismatch is caught.
    expect(hub.state.commits).toHaveLength(0);
  });

  it("fails closed when the file changed since the patch was generated", async () => {
    hub.state.files.set(
      "src/Hero.tsx",
      'export const Hero = () => <button aria-label="Edited"></button>;\n',
    );

    await expect(run()).rejects.toThrow(/oldText not found/);
    expect(hub.state.blobs).toHaveLength(0);
  });

  it("rejects an ambiguous edit", async () => {
    hub.state.files.set(
      "src/Hero.tsx",
      "export const A = () => <button></button>;\nexport const B = () => <button></button>;\n",
    );

    await expect(run()).rejects.toThrow(/not unique/);
    expect(hub.state.blobs).toHaveLength(0);
  });

  it("rejects a patch that does not change the file", async () => {
    await expect(
      run({
        ...CANDIDATE,
        edits: [
          {
            path: "src/Hero.tsx",
            oldText: "<button></button>",
            newText: "<button></button>",
          },
        ],
      }),
    ).rejects.toThrow(/No changes to commit/);
    expect(hub.state.commits).toHaveLength(0);
  });

  it("fails when the target file is missing from the repository", async () => {
    await expect(
      run(
        {
          ...CANDIDATE,
          edits: [
            {
              path: "src/Gone.tsx",
              oldText: "<button></button>",
              newText: '<button aria-label="Save"></button>',
            },
          ],
        },
        {
          ...FINDING,
          location: {
            kind: "source",
            filePath: "src/Gone.tsx",
            line: 1,
            column: 1,
            snippet: "<button></button>",
            span: { start: 0, end: 18 },
          },
        },
      ),
    ).rejects.toThrow(/File not found in acme\/shop/);
  });

  it("refuses to commit an edit outside the finding's file", async () => {
    await expect(
      run({
        ...CANDIDATE,
        edits: [
          {
            path: "src/Other.tsx",
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
      }),
    ).rejects.toThrow(/must target src\/Hero.tsx/);
    expect(hub.state.blobs).toHaveLength(0);
  });

  it("preserves the executable bit of the committed file", async () => {
    hub.state.fileModes.set("src/Hero.tsx", "100755");

    await run();

    expect(hub.state.treeEntries[0]?.[0]?.mode).toBe("100755");
  });

  it("resolves the executable bit when the recursive tree is truncated", async () => {
    hub.state.treeTruncated = true;
    hub.state.fileModes.set("src/Hero.tsx", "100755");

    await run();

    expect(hub.state.treeEntries[0]?.[0]?.mode).toBe("100755");
  });

  it("fails loud when the GitHub token is unavailable", async () => {
    tokenMock.mockResolvedValue(null);

    await expect(run()).rejects.toThrow(
      /token unavailable.*Nothing was pushed/,
    );
    expect(hub.state.blobs).toHaveLength(0);
  });

  it("falls back to the repository default branch when the tracked one is gone", async () => {
    const result = await run(CANDIDATE, FINDING, {
      ...PROJECT,
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
        trackedBranch: "release",
      },
    });

    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/42");
    expect(hub.state.commits[0]?.parents).toEqual(["base-sha"]);
    // The PR targets the branch that actually exists, not the stale tracked one.
    expect(hub.state.prCreateArgs[0]?.base).toBe("main");
    expect(result.branch).toBe(BRANCH);
  });

  it("rejects runtime DOM findings before any repository call", async () => {
    await expect(
      run(CANDIDATE, {
        ...FINDING,
        location: {
          kind: "dom",
          url: "https://preview.example/",
          selector: "button",
          snippet: "<button></button>",
        },
      }),
    ).rejects.toThrow(/cannot be committed automatically/);
    expect(hub.state.blobs).toHaveLength(0);
  });

  it("requires a verified candidate", async () => {
    await expect(run(null)).rejects.toThrow(/Generate and review/);
    await expect(
      run({ ...CANDIDATE, complyLoop: { passed: false, remaining: [] } }),
    ).rejects.toThrow(/Generate and review/);
  });

  it("surfaces a PR API failure after the commit", async () => {
    hub.state.failPrCreate = true;

    await expect(run()).rejects.toThrow(
      /was committed, but opening the draft pull request failed/,
    );
    expect(hub.state.commits).toHaveLength(1);
  });
});
