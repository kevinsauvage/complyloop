/** Newest-first evidence rows kept in the workspace read snapshot. */
export const WORKSPACE_EVIDENCE_LIMIT = 100;

export function workspaceReadEvidenceLimit(): number {
  return WORKSPACE_EVIDENCE_LIMIT;
}
