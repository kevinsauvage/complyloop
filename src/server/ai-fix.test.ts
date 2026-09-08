import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatchCandidate } from "@/ai/verified-fix";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Finding, Remediation } from "@complyloop/db/types";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { emptyDb } from "@complyloop/db/types";
import {
  latestPatchState,
  patchCandidateFromEvidence,
  persistPatchCandidate,
  pullRequestUrlFromEvidence,
  runAiFixOnCheckout,
} from "./ai-fix";

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
  };
}

function tempRoot(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-fix-"));
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

describe("latestPatchState", () => {
  it("returns a ready candidate from the latest patch evidence", () => {
    expect(latestPatchState([])).toEqual({ status: "idle" });

    const ready = {
      kind: "ai_patch_ready" as const,
      summary: "Patch ready",
      detail: {
        description: "Add alt",
        provenance: "ai",
        model: "minimax/minimax-m3",
        edits: [
          {
            path: "Hero.tsx",
            oldText: "<img />",
            newText: '<img alt="Hero" />',
          },
        ],
        complyLoopPassed: true,
        remaining: [],
      },
    };

    expect(patchCandidateFromEvidence([ready])).toEqual({
      description: "Add alt",
      provenance: "ai",
      model: "minimax/minimax-m3",
      edits: [
        {
          path: "Hero.tsx",
          oldText: "<img />",
          newText: '<img alt="Hero" />',
        },
      ],
      complyLoop: { passed: true, remaining: [] },
    });
    expect(latestPatchState([ready])).toEqual({
      status: "ready",
      candidate: patchCandidateFromEvidence([ready]),
    });
  });

  it("ignores malformed or non-passing patch evidence", () => {
    expect(
      patchCandidateFromEvidence([
        {
          kind: "ai_patch_ready",
          summary: "invalid",
          detail: {
            description: "No gate",
            provenance: "ai",
            edits: [],
            complyLoopPassed: false,
          },
        },
      ]),
    ).toBeNull();
  });
});

describe("persistPatchCandidate", () => {
  const patchFinding: Finding = {
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
      snippet: "<img />",
      span: { start: 0, end: 7 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };

  const remediation: Remediation = {
    id: "r1",
    findingId: "f1",
    status: "detected",
    suggestion: null,
    history: [],
  };

  const candidate: PatchCandidate = {
    description: "Add alt",
    provenance: "ai",
    model: "minimax/minimax-m3",
    edits: [
      {
        path: "Hero.tsx",
        oldText: "<img />",
        newText: '<img alt="Hero" />',
      },
    ],
    complyLoop: { passed: true, remaining: [] },
  };

  it("records ready evidence and moves remediation to suggested", () => {
    const db = emptyDb();
    db.findings.push(patchFinding);
    db.remediations.push(remediation);
    const payload: ProjectWritePayload = {};

    persistPatchCandidate(db, patchFinding, candidate, payload);

    expect(payload.evidence?.[0]?.kind).toBe("ai_patch_ready");
    expect(payload.evidence?.[0]?.detail).toMatchObject({
      provenance: "ai",
      model: "minimax/minimax-m3",
      complyLoopPassed: true,
    });
    expect(payload.remediations?.[0]?.status).toBe("suggested");
    expect(payload.remediations?.[0]?.suggestion).toMatchObject({
      provenance: "ai",
      proposedSnippet: '<img alt="Hero" />',
    });
    // Loaded db is not mutated.
    expect(db.remediations[0]?.status).toBe("detected");
    expect(db.evidence).toHaveLength(0);
  });
});

describe("pullRequestUrlFromEvidence", () => {
  it("returns the latest pull request URL from evidence", () => {
    expect(
      pullRequestUrlFromEvidence([
        {
          kind: "pull_request_prepared",
          detail: { prUrl: "https://github.com/o/r/pull/1" },
        },
        {
          kind: "pull_request_prepared",
          detail: { prUrl: "https://github.com/o/r/pull/2" },
        },
      ]),
    ).toBe("https://github.com/o/r/pull/2");
  });

  it("returns null when no PR evidence exists", () => {
    expect(pullRequestUrlFromEvidence([])).toBeNull();
  });
});
