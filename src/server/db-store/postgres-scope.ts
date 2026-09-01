import type { DbLoadScope } from "./types";

/** Newest-first evidence rows kept in the workspace read snapshot. */
export const WORKSPACE_EVIDENCE_LIMIT = 100;

export function fullLoadScope(): DbLoadScope {
  return { mode: "full" };
}

export function scopedLoadScope(input: {
  orgIds: readonly string[];
  projectIds: readonly string[];
  evidenceLimit?: number;
}): DbLoadScope {
  return {
    mode: "scoped",
    orgIds: [...input.orgIds],
    projectIds: [...input.projectIds],
    ...(input.evidenceLimit !== undefined
      ? { evidenceLimit: input.evidenceLimit }
      : {}),
  };
}

export function isFullLoadScope(
  scope: DbLoadScope,
): scope is { mode: "full" } {
  return scope.mode === "full";
}

export function workspaceReadEvidenceLimit(): number {
  return WORKSPACE_EVIDENCE_LIMIT;
}
