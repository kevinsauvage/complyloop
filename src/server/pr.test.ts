import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonNameCheck } from "@complyloop/analysis-core/checks/button-name";
import { applyFix } from "@complyloop/analysis-core/fixes";
import { parseSource } from "@complyloop/analysis-core/parse";
import { scanFile } from "@complyloop/analysis-core/scan";
import type { Control, Project } from "@complyloop/analysis-core/contract/project-types";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { testProject } from "@/test-fixtures/project";
import { locateViolationInProject, mergeFix } from "./assessment-findings";
import { createGit } from "./git";
import { preparePullRequest } from "./pr";

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

const githubCloneUrl = vi.hoisted(() => vi.fn(() => ""));

vi.mock("./repo-checkout", () => ({
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

vi.mock("./connect-github", () => ({
  githubCloneUrl,
}));

vi.mock("./octokit", () => ({
  createOctokit: () => ({
    rest: { pulls: { create: createPullRequest } },
  }),
  octokitErrorMessage: (error: unknown) => String(error),
}));

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

  const git = createGit({ baseDir: root });
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.add(["."]);
  await git.commit("initial");

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
    expect(result.committed).toBe(true);
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

    expect(result.committed).toBe(true);
    expect(fs.readFileSync(path.join(root, relative), "utf8")).toContain(
      'aria-label="Save"',
    );
    expect(scanFile(root, relative)).toHaveLength(0);
  });

  it("opens AI-generated changes as a draft pull request", async () => {
    const initial = `export const Hero = () => <button></button>;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);
    finding.fix = null;
    resolveProjectGitHubToken.mockResolvedValue("token");
    githubCloneUrl.mockReturnValue(root);

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
    expect(createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        body: expect.stringContaining("Repository tests run in GitHub CI"),
      }),
    );
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
});
