import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buttonNameCheck } from "@complyloop/analysis-core/checks/families/names";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { applyFix } from "@complyloop/analysis-core/fixes";
import { parseSource } from "@complyloop/analysis-core/parse";
import { scanFile } from "@complyloop/analysis-core/scan";

import { testProject } from "@/test-fixtures/project";

import {
  locateViolationInProject,
  mergeFix,
} from "../assessment/assessment-findings";
import { preparePullRequest } from "./pr";

/**
 * The only network edge in PR preparation is the push: everything else
 * (branch, checkout, status, add, commit) runs against the local fixture via
 * the real pure-JS implementation. Push is mocked per-test (resolve = remote
 * accepts, reject = remote refuses).
 */
const isoPush = vi.hoisted(() => vi.fn());

vi.mock("isomorphic-git", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("isomorphic-git")>();
  const passthrough = [
    "init",
    "add",
    "commit",
    "currentBranch",
    "listBranches",
    "checkout",
    "branch",
    "statusMatrix",
  ] as const;
  const mocked: Record<string, (...args: never[]) => unknown> = {
    push: (...args: never[]) => isoPush(...args),
  };
  const real = actual.default as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;
  for (const name of passthrough) {
    const fn = real[name];
    if (typeof fn !== "function") throw new Error(`missing git.${name}`);
    mocked[name] = (...args: never[]) => fn(...args);
  }
  return { ...actual, default: mocked };
});

isoPush.mockResolvedValue({ ok: true, refs: {} });

const withProjectCheckout = vi.hoisted(() =>
  vi.fn(
    async <T>(
      project: unknown,
      fn: (rootPath: string) => Promise<T>,
      ref?: string,
    ): Promise<T> => {
      void project;
      void fn;
      void ref;
      throw new Error("withProjectCheckout mock not configured");
    },
  ),
);

const resolveProjectGitHubToken = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(async () => null),
);

const createPullRequest = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { html_url: "https://github.com/acme/shop/pull/42" },
  })),
);

const listPullRequests = vi.hoisted(() =>
  vi.fn(async () => ({
    data: [] as Array<{ html_url: string }>,
  })),
);

const githubPublicCloneUrl = vi.hoisted(() => vi.fn(() => ""));

vi.mock("../assessment/repo-checkout", () => ({
  withProjectCheckout: (
    project: unknown,
    fn: (rootPath: string) => Promise<unknown>,
    ref?: string,
  ) => withProjectCheckout(project, fn, ref),
  withRepoCheckout: vi.fn(),
}));

vi.mock("./github-access", () => ({
  resolveProjectGitHubToken,
}));

vi.mock("./github", async (importOriginal) => {
  const original = await importOriginal<typeof import("./github")>();
  return {
    ...original,
    githubPublicCloneUrl,
    parseOwnerRepo: (fullName: string) => {
      const [owner, repo] = fullName.split("/");
      if (!owner || !repo) throw new Error("invalid full name");
      return { owner, repo };
    },
    createOctokit: () => ({
      rest: { pulls: { create: createPullRequest, list: listPullRequests } },
    }),
    octokitErrorMessage: (error: unknown) => String(error),
  };
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

async function initRepo(source: string): Promise<{
  root: string;
  relative: string;
  project: Project;
  control: Control;
  finding: Finding;
  remediation: Remediation;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pr-test-"));
  tempDirs.push(root);
  const relative = "Hero.tsx";
  fs.writeFileSync(path.join(root, relative), source);

  await git.init({ fs, dir: root, defaultBranch: "main" });
  await git.add({ fs, dir: root, filepath: relative });
  await git.commit({
    fs,
    dir: root,
    message: "initial",
    author: { name: "Test", email: "test@example.com" },
  });

  const [raw] = buttonNameCheck.run(parseSource(relative, source));
  if (!raw?.fix) throw new Error("expected button-name fix");

  const project = testProject({
    name: "shop",
    github: {
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    },
    createdAt: new Date().toISOString(),
  });
  const control: Control = {
    id: "ctl-button-name",
    frameworkId: "fw",
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 11.9",
    title: "Buttons have an accessible name",
    description: "Every button exposes a name describing its action.",
    checkId: "button-name",
  };
  const finding: Finding = {
    id: "f1",
    projectId: project.id,
    controlId: control.id,
    assessmentId: "a1",
    checkId: "button-name",
    status: "open",
    kind: raw.kind,
    severity: raw.severity,
    confidence: raw.confidence,
    reason: raw.reason,
    location: raw.location,
    fix: raw.fix,
    explanations: [],
    detectedAt: new Date().toISOString(),
  };
  const remediation: Remediation = {
    id: "r1",
    findingId: finding.id,
    status: "approved",
    suggestion: {
      description: "Add alt",
      proposedSnippet: '<button aria-label="Save"></button>',
      provenance: "deterministic",
    },
    history: [],
  };

  withProjectCheckout.mockImplementation(async (_project, fn) => fn(root));

  return { root, relative, project, control, finding, remediation };
}

describe("locateViolationInProject + PR apply", () => {
  it("re-locates a drifted span and applies the fix at the current offset", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);

    // Drift the file: prepend lines so stored span offsets are stale.
    const drifted = `/* banner */\n\n${initial}`;
    fs.writeFileSync(path.join(root, relative), drifted);

    const match = locateViolationInProject(root, finding);
    expect(match?.fix).toBeTruthy();
    expect(match?.location.kind).toBe("source");
    expect(
      match?.location.kind === "source" && finding.location.kind === "source"
        ? match.location.span.start !== finding.location.span.start
        : false,
    ).toBe(true);

    const fix = mergeFix(finding.fix, match!.fix);
    expect(fix).toBeTruthy();

    const fixed = applyFix(drifted, fix!);
    expect(fixed).toContain("aria-label=");
    // Stale stored span would leave the violation or corrupt the banner comment.
    const staleFixed = applyFix(drifted, finding.fix!);
    expect(staleFixed).not.toBe(fixed);

    // Poison the stored fix span — preparePullRequest must re-locate, not use it.
    if (finding.fix?.kind === "insert_attribute") {
      finding.fix = {
        ...finding.fix,
        span: { start: 0, end: 5 },
      };
    }

    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      {
        description: "Add alt",
        provenance: "deterministic",
        edits: [{ path: relative, oldText: drifted, newText: fixed }],
        complyLoop: { passed: true, remaining: [] },
      },
    );
    expect(result.branch).toContain("complyloop/fix-");
    const onDisk = fs.readFileSync(path.join(root, relative), "utf8");
    expect(onDisk).toContain("aria-label=");
    expect(onDisk.startsWith("/* banner */")).toBe(true);
    expect(scanFile(root, relative)).toHaveLength(0);
  });

  it("commits a verified AI patch when there is no structured fix template", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;

    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      },
    );

    expect(result.branch).toContain("complyloop/fix-");
    expect(fs.readFileSync(path.join(root, relative), "utf8")).toContain(
      'aria-label="Save"',
    );
    expect(scanFile(root, relative)).toHaveLength(0);
  });

  it("fails loud when the patch does not change the working tree", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { relative, project, control, finding, remediation } =
      await initRepo(initial);

    await expect(
      preparePullRequest(project, control, finding, remediation, {
        description: "No-op",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: "<button></button>",
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      }),
    ).rejects.toThrow(/No changes to commit/);
  });

  it("opens AI-generated changes as a draft pull request", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    githubPublicCloneUrl.mockReturnValue(root);

    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      },
    );

    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/42");
    expect(isoPush).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: expect.stringContaining("complyloop/fix-"),
        remoteRef: expect.stringContaining("complyloop/fix-"),
        force: true,
      }),
    );
    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        body: expect.stringContaining("Repository tests run in GitHub CI"),
      }),
    );
  });

  it("fails loud when pushing the fix branch fails", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    // The branch commits locally, then the remote refuses the push: push +
    // PR creation fail as one user-visible error.
    isoPush.mockRejectedValueOnce(new Error("remote: permission denied"));

    await expect(
      preparePullRequest(project, control, finding, remediation, {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      }),
    ).rejects.toThrow(/committed locally but push/);
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("aborts when the violation can no longer be found", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);

    fs.writeFileSync(
      path.join(root, relative),
      `export const Hero = () => <button aria-label="ok"></button>;\n`,
    );

    await expect(
      preparePullRequest(project, control, finding, remediation, {
        description: "Add alt",
        provenance: "deterministic",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label=""></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      }),
    ).rejects.toThrow(/oldText not found/);
  });

  it("rejects runtime DOM findings without touching git", async () => {
    const { project, control, finding, remediation } = await initRepo(
      `export const Hero = () => <button></button>;\n`,
    );
    await expect(
      preparePullRequest(
        project,
        control,
        {
          ...finding,
          location: {
            kind: "dom",
            url: "https://preview.example/",
            selector: "button",
            snippet: "<button></button>",
          },
        },
        remediation,
        null,
      ),
    ).rejects.toThrow(/cannot be committed automatically/);
  });

  it("requires a verified candidate before opening a checkout", async () => {
    const { project, control, finding, remediation } = await initRepo(
      `export const Hero = () => <button></button>;\n`,
    );
    await expect(
      preparePullRequest(project, control, finding, remediation, null),
    ).rejects.toThrow(/Generate and review/);
  });

  it("fails when the checkout is not a git repository", async () => {
    const { project, control, finding, remediation } = await initRepo(
      `export const Hero = () => <button></button>;\n`,
    );
    finding.fix = null;
    withProjectCheckout.mockImplementation(async (_project, fn) =>
      fn(os.tmpdir()),
    );
    await expect(
      preparePullRequest(project, control, finding, remediation, {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: "Hero.tsx",
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      }),
    ).rejects.toThrow(/requires a git repository/);
  });

  it("surfaces GitHub API failures after a successful push", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    createPullRequest.mockRejectedValueOnce(new Error("API down"));

    await expect(
      preparePullRequest(project, control, finding, remediation, {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      }),
    ).rejects.toThrow(/committed locally but push/);
  });

  it("reuses the existing fix branch on a second run", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    githubPublicCloneUrl.mockReturnValue(root);
    const candidate = {
      description: "Add alt",
      provenance: "ai" as const,
      edits: [
        {
          path: relative,
          oldText: "<button></button>",
          newText: '<button aria-label="Save"></button>',
        },
      ],
      complyLoop: { passed: true, remaining: [] },
    };

    const first = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      candidate,
    );
    // The working tree already carries the first fix; the second run must
    // reuse the branch instead of creating it again.
    const second = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      {
        ...candidate,
        edits: [
          {
            path: relative,
            oldText: '<button aria-label="Save"></button>',
            newText: '<button aria-label="Save twice"></button>',
          },
        ],
      },
    );
    expect(second.branch).toBe(first.branch);
    expect(second.prUrl).toBe("https://github.com/acme/shop/pull/42");
  });

  it("reuses an open PR from pulls.list without calling pulls.create", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    githubPublicCloneUrl.mockReturnValue(root);
    listPullRequests.mockResolvedValue({
      data: [{ html_url: "https://github.com/acme/shop/pull/7" }],
    });

    const result = await preparePullRequest(
      project,
      control,
      finding,
      remediation,
      {
        description: "Add alt",
        provenance: "ai",
        edits: [
          {
            path: relative,
            oldText: "<button></button>",
            newText: '<button aria-label="Save"></button>',
          },
        ],
        complyLoop: { passed: true, remaining: [] },
      },
    );

    expect(result.prUrl).toBe("https://github.com/acme/shop/pull/7");
    expect(listPullRequests).toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
  });
});
