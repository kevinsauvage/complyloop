import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control } from "@/core/project-types";
import type { Finding } from "@/core/finding-types";
import { runAiFixOnCheckout } from "./ai-fix-run";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "WCAG 1.3.1",
  secondaryCode: "RGAA 8.9",
  title: "Do not repeat implicit roles",
  description: "Use native semantics.",
  checkId: "redundant-role",
};

function finding(fix: Finding["fix"] = null): Finding {
  return {
    id: "f1",
    projectId: "p1",
    controlId: "c1",
    assessmentId: "a1",
    checkId: "redundant-role",
    status: "open",
    kind: "violation",
    severity: "moderate",
    confidence: "high",
    reason: "The footer repeats its implicit role",
    location: {
      kind: "source",
      filePath: "Footer.tsx",
      line: 1,
      column: 28,
      snippet: '<footer role="contentinfo" />',
      span: { start: 27, end: 56 },
    },
    fix,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
    engine: "ast",
  };
}

function tempRoot(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-fix-run-"));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, "Footer.tsx"), source);
  return root;
}

describe("runAiFixOnCheckout", () => {
  it("prefers a safe deterministic fix without calling AI", async () => {
    const source = "export const Footer = () => <input autoFocus />;\n";
    const attributeStart = source.indexOf(" autoFocus");
    const root = tempRoot(source);
    const propose = vi.fn();
    const deterministicFinding = finding({
      kind: "remove_attribute",
      attribute: "autoFocus",
      span: {
        start: attributeStart,
        end: attributeStart + " autoFocus".length,
      },
    });
    deterministicFinding.checkId = "no-autofocus";
    deterministicFinding.reason = "Avoid autofocus";
    deterministicFinding.location = {
      kind: "source",
      filePath: "Footer.tsx",
      line: 1,
      column: 28,
      snippet: "<input autoFocus />",
      span: { start: source.indexOf("<input"), end: source.indexOf("/>") + 2 },
    };

    const result = await runAiFixOnCheckout(
      root,
      deterministicFinding,
      control,
      {
        propose,
        scan: () =>
          fs.readFileSync(path.join(root, "Footer.tsx"), "utf8").includes(
            "autoFocus",
          )
            ? [
                {
                  checkId: "no-autofocus",
                  kind: "violation",
                  severity: "serious",
                  confidence: "high",
                  reason: "Avoid autofocus",
                  location: {
                    kind: "source",
                    filePath: "Footer.tsx",
                    line: 1,
                    column: 28,
                    snippet: "<input autoFocus />",
                    span: {
                      start: source.indexOf("<input"),
                      end: source.indexOf("/>") + 2,
                    },
                  },
                  fix: null,
                  engine: "ast",
                },
              ]
            : [],
      },
    );

    expect(propose).not.toHaveBeenCalled();
    expect(result.provenance).toBe("deterministic");
    expect(result.edits[0]?.newText).toContain("<input />");
  });

  it("uses one AI proposal when no safe deterministic fix exists", async () => {
    const root = tempRoot(
      'export const Footer = () => <footer role="contentinfo" />;\n',
    );
    const propose = vi.fn(async () => ({
      description: "Remove the redundant role",
      provenance: "ai" as const,
      edits: [
        {
          path: "Footer.tsx",
          oldText: '<footer role="contentinfo" />',
          newText: "<footer />",
        },
      ],
    }));

    const result = await runAiFixOnCheckout(root, finding(), control, {
      propose,
      scan: () => [],
    });

    expect(propose).toHaveBeenCalledTimes(1);
    expect(result.provenance).toBe("ai");
    expect(result.complyLoop.passed).toBe(true);
  });

  it("fails with actionable copy when AI is unavailable and no deterministic fix exists", async () => {
    const root = tempRoot(
      'export const Footer = () => <footer role="contentinfo" />;\n',
    );
    // Simulates the no-API-key path: the default proposeFixEdits would be
    // called and the gateway call must never happen.
    const propose = vi.fn(async () => {
      throw new Error("fetch failed: gateway unreachable");
    });

    await expect(
      runAiFixOnCheckout(root, finding(), control, {
        propose,
        scan: () => [],
        aiAvailable: false,
      }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    expect(propose).not.toHaveBeenCalled();
  });
});
