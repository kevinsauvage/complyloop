/** Newest-first evidence rows kept in the workspace read snapshot. */
export const WORKSPACE_EVIDENCE_LIMIT = 100;

/**
 * Newest rows included in JSON / report exports. Decision records stay in the
 * DB forever (append-only); this only bounds the download, not the table.
 */
export const EVIDENCE_EXPORT_LIMIT = 5_000;
