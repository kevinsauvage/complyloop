import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSource } from "@/analysis/parse";
import { imgAltCheck } from "@/analysis/checks/img-alt";
import type { Control, Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { buildDeveloperHandoff, buildDiffForFix } from "./handoff";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("developer handoff", () => {
  it("builds a unified diff and PR body from a proposed fix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-"));
    tempDirs.push(root);
    const relative = "Hero.tsx";
    const source = `export const Hero = () => <img src="/hero.png" />;\n`;
    fs.writeFileSync(path.join(root, relative), source);

    const [raw] = imgAltCheck.run(parseSource(relative, source));
    if (!raw.fix) throw new Error("expected fix");

    const project: Project = {
      id: "p1",
      name: "shop",
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
      explanations: [
        {
          whyItFailed: raw.reason,
          impact: "Screen reader users miss the image.",
          howToFix: "Add a descriptive alt attribute.",
          provenance: "deterministic",
          generatedAt: new Date().toISOString(),
        },
      ],
      detectedAt: new Date().toISOString(),
    };
    const remediation: Remediation = {
      id: "r1",
      findingId: finding.id,
      status: "suggested",
      suggestion: {
        description: "Add alt",
        proposedSnippet: '<img src="/hero.png" alt="Hero" />',
        provenance: "deterministic",
      },
      history: [],
    };

    const diff = buildDiffForFix(root, finding, raw.fix);
    expect(diff).toContain("--- a/Hero.tsx");
    expect(diff).toContain("+++ b/Hero.tsx");
    expect(diff).toMatch(/\+.*alt=/);

    const handoff = buildDeveloperHandoff(
      project,
      control,
      finding,
      remediation,
      root,
    );
    expect(handoff.title).toContain("WCAG 1.1.1");
    expect(handoff.body).toContain("## Requirement");
    expect(handoff.body).toContain("## Verification");
    expect(handoff.diff).toContain("Hero.tsx");
  });
});
