import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { imgAltCheck } from "@/analysis/checks/img-alt";
import { applyFix } from "@/analysis/fixes";
import { parseSource } from "@/analysis/parse";
import { scanFile } from "@/analysis/scan";
import type { Control, Finding, Project, Remediation } from "@/core/types";
import { locateViolationInProject, mergeFix } from "./assessment-helpers";
import { createGit } from "./git";
import { preparePullRequest } from "./pr";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

  const [raw] = imgAltCheck.run(parseSource(relative, source));
  if (!raw?.fix) throw new Error("expected img-alt fix");

  const project: Project = {
    id: "p1",
    name: "shop",
    rootPath: root,
    source: "github",
    createdAt: new Date().toISOString(),
  };
  const control: Control = {
    id: "ctl-img-alt",
    frameworkId: "fw",
    code: "WCAG 1.1.1",
    secondaryCode: "RGAA 1.1",
    title: "Images have a text alternative",
    description: "Every informative image exposes a text alternative.",
    checkId: "img-alt",
  };
  const finding: Finding = {
    id: "f1",
    projectId: project.id,
    controlId: control.id,
    assessmentId: "a1",
    checkId: "img-alt",
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
      proposedSnippet: '<img src="/hero.png" alt="Hero" />',
      provenance: "deterministic",
    },
    history: [],
  };
  return { root, relative, project, control, finding, remediation };
}

describe("locateViolationInProject + PR apply", () => {
  it("re-locates a drifted span and applies the fix at the current offset", async () => {
    const initial = `export const Hero = () => <img src="/hero.png" />;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);

    // Drift the file: prepend lines so stored span offsets are stale.
    const drifted = `/* banner */\n\n${initial}`;
    fs.writeFileSync(path.join(root, relative), drifted);

    const match = locateViolationInProject(project, finding);
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
    expect(fixed).toContain('alt="');
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
    );
    expect(result.committed).toBe(true);
    const onDisk = fs.readFileSync(path.join(root, relative), "utf8");
    expect(onDisk).toContain('alt="');
    expect(onDisk.startsWith("/* banner */")).toBe(true);
    expect(scanFile(root, relative)).toHaveLength(0);
  });

  it("aborts when the violation can no longer be found", async () => {
    const initial = `export const Hero = () => <img src="/hero.png" />;\n`;
    const { root, relative, project, control, finding, remediation } =
      await initRepo(initial);

    fs.writeFileSync(
      path.join(root, relative),
      `export const Hero = () => <img src="/hero.png" alt="ok" />;\n`,
    );

    await expect(
      preparePullRequest(project, control, finding, remediation),
    ).rejects.toThrow(/could not be re-located/);
  });
});
