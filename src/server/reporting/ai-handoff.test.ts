import { describe, expect, it, vi } from "vitest";

import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";

vi.mock("server-only", () => ({}));

import {
  findingHandoff,
  findingsBatchHandoff,
  unableToVerifyHandoff,
} from "./ai-handoff";

const project = testProject({
  name: "Shop",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    trackedBranch: "develop",
    private: true,
  },
});

describe("unableToVerifyHandoff", () => {
  it("lists every requirement with its reason and the repo/branch", () => {
    const text = unableToVerifyHandoff(project, [
      {
        control: testControl({
          code: "WCAG 1.3.1",
          secondaryCode: "RGAA 9.1",
          title: "Headings",
          description: "Headings structure the content.",
        }),
        reason: "Needs human review.",
      },
      {
        control: testControl({ code: "WCAG 2.4.2", title: "Page title" }),
        reason: "Needs a preview URL.",
      },
    ]);

    expect(text).toContain("# Manual accessibility review — acme/shop");
    expect(text).toContain("Repository: acme/shop (branch `develop`)");
    expect(text).toContain("could not verify the 2 RGAA / WCAG requirements");
    expect(text).toContain("## 1. WCAG 1.3.1 · RGAA 9.1 — Headings");
    expect(text).toContain("Headings structure the content.");
    expect(text).toContain("Why not automated: Needs human review.");
    expect(text).toContain("## 2. WCAG 2.4.2 · WCAG — Page title");
  });

  it("falls back to the project name without a GitHub repo", () => {
    const text = unableToVerifyHandoff(testProject({ name: "Local" }), []);
    expect(text).toContain("Project: Local");
    expect(text).toContain("0 RGAA / WCAG requirements");
  });
});

describe("findingHandoff", () => {
  it("includes location, rule, explanation and a fenced snippet", () => {
    const text = findingHandoff(project, {
      control: testControl({ code: "WCAG 1.1.1", secondaryCode: "RGAA 1.1" }),
      finding: testFinding({
        explanations: [
          {
            whyItFailed: "Image has no alt.",
            impact: "Screen readers skip it.",
            howToFix: "Add a meaningful alt.",
            provenance: "deterministic",
            generatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    });

    expect(text).toContain(
      "# Fix accessibility finding — WCAG 1.1.1 · RGAA 1.1",
    );
    expect(text).toContain("- File: `App.tsx:1`");
    expect(text).toContain("`img-alt` · severity serious · confidence high");
    expect(text).toContain("What failed: Image has no alt.");
    expect(text).toContain("How to fix: Add a meaningful alt.");
    expect(text).toContain('```tsx\n<img src="x" />\n```');
  });

  it("describes rendered-page findings by URL and selector", () => {
    const text = findingHandoff(project, {
      control: testControl(),
      finding: testFinding({
        analyzerId: "axe",
        analyzerRuleId: "color-contrast",
        location: {
          kind: "dom",
          url: "https://preview.example/about",
          selector: "main > h1",
          snippet: "<h1>About</h1>",
        },
      }),
    });

    expect(text).toContain("- Rendered page: https://preview.example/about");
    expect(text).toContain("- Selector: `main > h1`");
    expect(text).toContain("`img-alt (axe: color-contrast)`");
    expect(text).toContain("What failed: Missing alt");
    expect(text).toContain("```html\n<h1>About</h1>\n```");
  });

  it("lengthens the fence when the snippet contains backticks", () => {
    const text = findingHandoff(project, {
      control: testControl(),
      finding: testFinding({
        location: {
          kind: "source",
          filePath: "a.md",
          line: 3,
          column: 1,
          snippet: "```js\nx\n```",
          span: { start: 0, end: 1 },
        },
      }),
    });
    expect(text).toContain("````\n```js\nx\n```\n````");
  });
});

describe("findingsBatchHandoff", () => {
  it("numbers each finding under one prompt", () => {
    const text = findingsBatchHandoff(project, [
      { control: testControl({ title: "Images" }), finding: testFinding() },
      {
        control: testControl({ title: "Links" }),
        finding: testFinding({ checkId: "link-name" }),
      },
    ]);
    expect(text).toContain("# Fix 2 accessibility findings — acme/shop");
    expect(text).toContain("## 1. 1.1.1 · WCAG — Images");
    expect(text).toContain("## 2. 1.1.1 · WCAG — Links");
    expect(text).toContain("`link-name`");
  });
});
