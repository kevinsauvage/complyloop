import { describe, expect, it } from "vitest";
import type { PatchCandidate } from "@/ai/verified-fix";
import type { Finding, Remediation } from "@/core/finding-types";
import { emptyDb } from "./db";
import { persistPatchCandidate } from "./ai-fix-persist";

const finding: Finding = {
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

describe("persistPatchCandidate", () => {
  it("records ready evidence and moves remediation to suggested", () => {
    const db = emptyDb();
    db.findings.push(finding);
    db.remediations.push(remediation);

    persistPatchCandidate(db, finding, candidate);

    expect(db.evidence[0]?.kind).toBe("ai_patch_ready");
    expect(db.evidence[0]?.detail).toMatchObject({
      provenance: "ai",
      model: "minimax/minimax-m3",
      complyLoopPassed: true,
    });
    expect(db.remediations[0]?.status).toBe("suggested");
    expect(db.remediations[0]?.suggestion).toMatchObject({
      provenance: "ai",
      proposedSnippet: '<img alt="Hero" />',
    });
  });
});
