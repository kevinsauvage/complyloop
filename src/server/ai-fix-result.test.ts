import { describe, expect, it } from "vitest";
import {
  latestPatchState,
  patchCandidateFromEvidence,
} from "./ai-fix-result";

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
