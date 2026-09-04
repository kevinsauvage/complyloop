import { describe, expect, it } from "vitest";
import {
  WORKSPACE_EVIDENCE_LIMIT,
  workspaceReadEvidenceLimit,
} from "./postgres-scope";

describe("postgres-scope", () => {
  it("uses a bounded evidence window for workspace reads", () => {
    expect(workspaceReadEvidenceLimit()).toBe(WORKSPACE_EVIDENCE_LIMIT);
    expect(WORKSPACE_EVIDENCE_LIMIT).toBeGreaterThan(0);
  });
});
