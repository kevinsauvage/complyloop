import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import type { RawFinding } from "@complyloop/analysis-core/types";
import {
  applyFileEdits,
  complyLoopGate,
  generatePatchCandidate,
} from "./verified-fix";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-fix-"));
  tempDirs.push(root);
  return root;
}

function sourceFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    projectId: "p1",
    controlId: "c1",
    assessmentId: "a1",
    checkId: "img-alt",
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "Image has no alt",
    location: {
      kind: "source",
      filePath: "Hero.tsx",
      line: 1,
      column: 1,
      snippet: '<img src="/hero.png" />',
      span: { start: 0, end: 23 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
    engine: "ast",
    ...overrides,
  };
}

function rawOnFile(
  checkId: RawFinding["checkId"],
  filePath: string,
  reason: string,
): RawFinding {
  return {
    checkId,
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason,
    location: {
      kind: "source",
      filePath,
      line: 1,
      column: 1,
      snippet: reason,
      span: { start: 0, end: 1 },
    },
    fix: null,
    engine: "ast",
  };
}

describe("applyFileEdits", () => {
  it("applies a unique oldText replacement and rejects path escape", () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "Hero.tsx"), '<img src="/hero.png" />\n');

    const edited = applyFileEdits(root, [
      {
        path: "Hero.tsx",
        oldText: '<img src="/hero.png" />',
        newText: '<img src="/hero.png" alt="Hero" />',
      },
    ]);

    expect(edited).toEqual(["Hero.tsx"]);
    expect(fs.readFileSync(path.join(root, "Hero.tsx"), "utf8")).toBe(
      '<img src="/hero.png" alt="Hero" />\n',
    );

    expect(() =>
      applyFileEdits(root, [
        { path: "../secret.ts", oldText: "a", newText: "b" },
      ]),
    ).toThrow(/escapes project root/);
  });

  it("fails when oldText is missing or not unique", () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "A.tsx"), "foo foo\n");

    expect(() =>
      applyFileEdits(root, [{ path: "A.tsx", oldText: "bar", newText: "baz" }]),
    ).toThrow(/not found/);

    expect(() =>
      applyFileEdits(root, [{ path: "A.tsx", oldText: "foo", newText: "bar" }]),
    ).toThrow(/not unique/);
  });

  it("throws when the edit targets a file that does not exist in the checkout", () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "A.tsx"), "foo\n");
    expect(() =>
      applyFileEdits(root, [{ path: "Missing.tsx", oldText: "x", newText: "y" }]),
    ).toThrow(/File not found in checkout/);
  });
});

describe("complyLoopGate", () => {
  it("passes when the original source finding is gone and no new findings appear", () => {
    const finding = sourceFinding();
    const baseline = [rawOnFile("img-alt", "Hero.tsx", "Image has no alt")];
    const after = [] as RawFinding[];
    expect(complyLoopGate(finding, baseline, after).passed).toBe(true);
  });

  it("fails when the original finding remains or a new check appears", () => {
    const finding = sourceFinding();
    const baseline = [rawOnFile("img-alt", "Hero.tsx", "Image has no alt")];
    expect(
      complyLoopGate(finding, baseline, [
        rawOnFile("img-alt", "Hero.tsx", "Image has no alt"),
      ]).passed,
    ).toBe(false);
    expect(
      complyLoopGate(finding, baseline, [
        rawOnFile("button-name", "Hero.tsx", "Button has no name"),
      ]).passed,
    ).toBe(false);
  });

  it("treats a brand-new DOM finding as remaining even without a source identity", () => {
    const domFinding = sourceFinding({
      location: {
        kind: "dom",
        url: "https://preview.example.com/",
        selector: "img",
        snippet: "<img>",
      },
    });
    const afterRaw: RawFinding = {
      ...rawOnFile("img-alt", "Hero.tsx", "Image has no alt"),
      location: {
        kind: "dom",
        url: "https://preview.example.com/",
        selector: "img",
        snippet: "<img>",
      },
    };
    const gate = complyLoopGate(domFinding, [], [afterRaw]);
    expect(gate.passed).toBe(false);
    expect(gate.remaining).toContain("img-alt");
  });
});

describe("generatePatchCandidate", () => {
  it("creates one patch candidate after a focused ComplyLoop gate passes", async () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "Hero.tsx"), '<img src="/hero.png" />\n');
    const finding = sourceFinding();

    let proposeCalls = 0;

    const result = await generatePatchCandidate({
      rootPath: root,
      finding,
      propose: async () => {
        proposeCalls += 1;
        return {
          description: "Add alt text",
          provenance: "ai",
          edits: [
            {
              path: "Hero.tsx",
              oldText: '<img src="/hero.png" />',
              newText: '<img src="/hero.png" alt="Hero" />',
            },
          ],
        };
      },
      scan: (files) => {
        const text = fs.readFileSync(path.join(root, files[0]!), "utf8");
        if (text.includes("alt=")) return [];
        return [rawOnFile("img-alt", "Hero.tsx", "Image has no alt")];
      },
    });

    expect(proposeCalls).toBe(1);
    expect(result).toEqual({
      description: "Add alt text",
      provenance: "ai",
      edits: [
        {
          path: "Hero.tsx",
          oldText: '<img src="/hero.png" />',
          newText: '<img src="/hero.png" alt="Hero" />',
        },
      ],
      complyLoop: { passed: true, remaining: [] },
    });
  });

  it("fails when the candidate does not clear the ComplyLoop gate", async () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "Hero.tsx"), '<img src="/x.png" />\n');
    const finding = sourceFinding();

    await expect(
      generatePatchCandidate({
        rootPath: root,
        finding,
        propose: async () => ({
          description: "No effective change",
          provenance: "ai",
          edits: [
            {
              path: "Hero.tsx",
              oldText: '<img src="/x.png" />',
              newText: '<img src="/x.png" />',
            },
          ],
        }),
        scan: () => [rawOnFile("img-alt", "Hero.tsx", "Image has no alt")],
      }),
    ).rejects.toThrow(/ComplyLoop still reports/);
  });

  it("rejects DOM findings, empty edits, and cross-file edits", async () => {
    await expect(
      generatePatchCandidate({
        rootPath: tempRoot(),
        finding: sourceFinding({
          location: {
            kind: "dom",
            url: "https://preview.example.com/",
            selector: "img",
            snippet: "<img>",
          },
        }),
        propose: async () => ({
          description: "nope",
          provenance: "ai",
          edits: [],
        }),
        scan: () => [],
      }),
    ).rejects.toThrow(/source finding/);

    const root = tempRoot();
    fs.writeFileSync(path.join(root, "Hero.tsx"), "<img />\n");
    await expect(
      generatePatchCandidate({
        rootPath: root,
        finding: sourceFinding(),
        propose: async () => ({
          description: "empty",
          provenance: "ai",
          edits: [],
        }),
        scan: () => [],
      }),
    ).rejects.toThrow(/at least one edit/);
    await expect(
      generatePatchCandidate({
        rootPath: root,
        finding: sourceFinding(),
        propose: async () => ({
          description: "cross-file",
          provenance: "ai",
          edits: [{ path: "Other.tsx", oldText: "a", newText: "b" }],
        }),
        scan: () => [],
      }),
    ).rejects.toThrow(/target Hero\.tsx/);
  });
});
