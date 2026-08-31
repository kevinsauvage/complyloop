import { describe, expect, it } from "vitest";
import {
  WORKSPACE_EVIDENCE_LIMIT,
  fullLoadScope,
  isFullLoadScope,
  scopedLoadScope,
  workspaceReadEvidenceLimit,
} from "./postgres-scope";

describe("postgres-scope", () => {
  it("treats full scope as global", () => {
    const scope = fullLoadScope();
    expect(isFullLoadScope(scope)).toBe(true);
    expect(scope).toEqual({ mode: "full" });
  });

  it("builds a tenant-scoped load with optional evidence cap", () => {
    const scope = scopedLoadScope({
      orgIds: ["org-a"],
      projectIds: ["p1", "p2"],
      evidenceLimit: 25,
    });
    expect(isFullLoadScope(scope)).toBe(false);
    expect(scope).toEqual({
      mode: "scoped",
      orgIds: ["org-a"],
      projectIds: ["p1", "p2"],
      evidenceLimit: 25,
    });
  });

  it("uses a bounded evidence window for workspace reads", () => {
    expect(workspaceReadEvidenceLimit()).toBe(WORKSPACE_EVIDENCE_LIMIT);
    expect(WORKSPACE_EVIDENCE_LIMIT).toBeGreaterThan(0);
  });
});
