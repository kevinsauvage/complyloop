import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import type { PatchCandidate } from "@/ai/verified-fix";
import { testProject } from "@/test-fixtures/project";

import {
  generatePatchCandidateForFinding,
  latestPatchState,
  patchCandidateFromEvidence,
  persistPatchCandidate,
  pullRequestUrlFromEvidence,
  runAiFixOnCheckout,
} from "./ai-fix";

const { reportWarningMock } = vi.hoisted(() => ({
  reportWarningMock: vi.fn(),
}));

const withProjectFileWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("./single-file-source", () => ({
  withProjectFileWorkspace: (...args: unknown[]) =>
    withProjectFileWorkspaceMock(...args),
}));

vi.mock("../observability", () => ({
  reportWarning: reportWarningMock,
  reportError: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  evidence: [] as EvidenceRecord[],
  remediation: undefined as Remediation | undefined,
  writtenEvidence: [] as EvidenceRecord[],
  writtenRemediations: [] as Remediation[],
}));

vi.mock("@complyloop/db/repo/evidence", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/evidence")
  >("@complyloop/db/repo/evidence");
  return {
    ...actual,
    listEvidenceForFinding: async () => mocks.evidence,
    insertEvidence: async (
      _tx: unknown,
      entry: Omit<EvidenceRecord, "id" | "at">,
    ) => {
      const record: EvidenceRecord = {
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      };
      mocks.writtenEvidence.push(record);
      return record;
    },
  };
});

vi.mock("@complyloop/db/repo/remediations", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/remediations")
  >("@complyloop/db/repo/remediations");
  return {
    ...actual,
    getRemediationByFindingId: async () => mocks.remediation,
    upsertRemediations: async (_tx: unknown, items: Remediation[]) => {
      mocks.writtenRemediations.push(...items);
    },
  };
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  mocks.evidence = [];
  mocks.remediation = undefined;
  mocks.writtenEvidence.length = 0;
  mocks.writtenRemediations.length = 0;
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
      // Exact scanner snippet: source identity is snippet-first, so the
      // fixture must carry what scanFile emits (not just the element).
      snippet: "export const Footer = () => <input autoFocus />;",
      span: { start: source.indexOf("<input"), end: source.indexOf("/>") + 2 },
    };

    const result = await runAiFixOnCheckout(
      root,
      deterministicFinding,
      control,
      {
        propose,
        scan: () =>
          fs
            .readFileSync(path.join(root, "Footer.tsx"), "utf8")
            .includes("autoFocus")
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
                    snippet: "export const Footer = () => <input autoFocus />;",
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

  it("skips deterministic relocation for editable insert fixes", async () => {
    const root = tempRoot('export const Hero = () => <img src="/x.png" />;\n');
    const propose = vi.fn(async () => ({
      description: "Add alt",
      provenance: "ai" as const,
      edits: [
        {
          path: "Footer.tsx",
          oldText: '<img src="/x.png" />',
          newText: '<img src="/x.png" alt="Hero" />',
        },
      ],
    }));
    const editable = finding({
      kind: "insert_attribute",
      attribute: "alt",
      value: "",
      editable: true,
      span: { start: 0, end: 5 },
    });
    editable.checkId = "img-alt";

    await runAiFixOnCheckout(root, editable, control, {
      propose,
      scan: () => [],
    });
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a safe fix cannot be re-located", async () => {
    const root = tempRoot(
      "export const Hero = () => <p>No violation here</p>;\n",
    );
    const relocated = finding({
      kind: "remove_attribute",
      attribute: "role",
      span: { start: 27, end: 56 },
    });

    await expect(
      runAiFixOnCheckout(root, relocated, control, {
        propose: vi.fn(),
        scan: () => [],
      }),
    ).rejects.toThrow(/re-located/);
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
    ).rejects.toThrow(/isn't enabled for this workspace/);
    expect(propose).not.toHaveBeenCalled();
  });
});

describe("generatePatchCandidateForFinding", () => {
  it("works on the finding's file without cloning the repository", async () => {
    const project = testProject();
    const source = "export const Hero = () => <input autoFocus />;\n";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-fix-file-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "Hero.tsx"), source, "utf8");
    withProjectFileWorkspaceMock.mockImplementation(
      async (
        _project: unknown,
        _filePath: string,
        fn: (rootPath: string) => Promise<PatchCandidate>,
      ) => fn(root),
    );
    const attributeStart = source.indexOf(" autoFocus");
    const target = finding({
      kind: "remove_attribute",
      attribute: "autoFocus",
      span: {
        start: attributeStart,
        end: attributeStart + " autoFocus".length,
      },
    });
    target.checkId = "no-autofocus";
    target.location = {
      kind: "source",
      filePath: "Hero.tsx",
      line: 1,
      column: 1,
      snippet: source.trim(),
      span: { start: source.indexOf("<input"), end: source.indexOf("/>") + 2 },
    };

    const candidate = await generatePatchCandidateForFinding(
      project,
      target,
      control,
      { aiAvailable: true },
    );

    expect(withProjectFileWorkspaceMock.mock.calls[0]?.[0]).toBe(project);
    expect(withProjectFileWorkspaceMock.mock.calls[0]?.[1]).toBe("Hero.tsx");
    expect(candidate.edits[0]?.path).toBe("Hero.tsx");
    expect(candidate.edits[0]?.newText).toContain("<input />");
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

  it("skips holes when scanning evidence backwards", () => {
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
    const sparse = [ready];
    sparse.length = 2;
    expect(patchCandidateFromEvidence(sparse as never)).toEqual(
      patchCandidateFromEvidence([ready]),
    );
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
    checkId: "redundant-role",
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

  const tx = {} as never;

  it("records ready evidence and moves remediation to suggested", async () => {
    mocks.evidence = [];
    mocks.remediation = remediation;

    await persistPatchCandidate(tx, patchFinding, candidate, "alice");

    expect(mocks.writtenEvidence[0]?.kind).toBe("ai_patch_ready");
    expect(mocks.writtenEvidence[0]?.actor).toBe("alice");
    expect(mocks.writtenEvidence[0]?.detail).toMatchObject({
      provenance: "ai",
      model: "minimax/minimax-m3",
      complyLoopPassed: true,
    });
    expect(mocks.writtenRemediations[0]?.status).toBe("suggested");
    expect(mocks.writtenRemediations[0]?.suggestion).toMatchObject({
      provenance: "ai",
      proposedSnippet: '<img alt="Hero" />',
    });
  });

  it("warns and skips the suggestion when remediation already advanced", async () => {
    reportWarningMock.mockClear();
    mocks.evidence = [];
    mocks.remediation = { ...remediation, status: "verified" };

    await persistPatchCandidate(tx, patchFinding, candidate, "alice");

    expect(reportWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("already advanced"),
      expect.objectContaining({
        code: "ai_patch_skipped_status",
        findingId: "f1",
        status: "verified",
      }),
    );
    expect(mocks.writtenRemediations).toHaveLength(0);
    expect(mocks.writtenEvidence[0]?.kind).toBe("ai_patch_ready");
  });

  it("skips byte-identical patch evidence already on the finding", async () => {
    mocks.evidence = [];
    mocks.remediation = remediation;
    await persistPatchCandidate(tx, patchFinding, candidate, "alice");
    expect(mocks.writtenEvidence).toHaveLength(1);
    const detail = mocks.writtenEvidence[0]?.detail;

    mocks.writtenEvidence.length = 0;
    mocks.evidence = [
      {
        id: "e-ready",
        at: "2026-01-01T00:00:00.000Z",
        kind: "ai_patch_ready",
        summary: "Patch ready",
        projectId: "p1",
        controlId: "c1",
        findingId: "f1",
        detail,
      },
    ];
    await persistPatchCandidate(tx, patchFinding, candidate, "alice");
    expect(mocks.writtenEvidence).toHaveLength(0);
  });

  it("refuses to store a patch that contains credential-shaped text", async () => {
    reportWarningMock.mockClear();
    mocks.evidence = [];
    mocks.remediation = remediation;

    await expect(
      persistPatchCandidate(
        tx,
        patchFinding,
        {
          ...candidate,
          edits: [
            {
              path: "Hero.tsx",
              oldText: "<img />",
              newText: '<img alt="Hero" data-key="secret: abc123def" />',
            },
          ],
        },
        "alice",
      ),
    ).rejects.toThrow(/looks like a credential/);
    // Nothing was written: a redacted copy would be committed as-is later.
    expect(mocks.writtenEvidence).toHaveLength(0);
    expect(mocks.writtenRemediations).toHaveLength(0);
  });

  it("throws without a remediation row for the finding", async () => {
    mocks.evidence = [];
    mocks.remediation = undefined;
    await expect(
      persistPatchCandidate(tx, patchFinding, candidate, "alice"),
    ).rejects.toThrow(/No remediation/);
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

  it("ignores PR evidence without a URL string", () => {
    expect(
      pullRequestUrlFromEvidence([
        { kind: "pull_request_prepared", detail: { prUrl: 42 } },
        { kind: "pull_request_prepared", detail: {} },
      ]),
    ).toBeNull();
  });
});
