/**
 * Pure ops-threshold evaluation for `npm run ops:check`.
 * Kept dependency-free (no `server-only`, no Drizzle) so both the tsx script
 * (`scripts/operations-check.ts`) and unit tests import it directly.
 */

export interface OpsSignals {
  /** Jobs in `queued`/`running` (same count `/api/health` reports). */
  queuedJobs: number;
  /** `pg_total_relation_size('evidence')` in bytes. */
  evidenceBytes: number;
  /** `pg_class.reltuples` estimate for `evidence` (no seq scan). */
  evidenceRowsEstimate: number;
}

export interface OpsThresholds {
  maxQueuedJobs: number;
  maxEvidenceBytes: number;
}

export interface OpsEvaluation {
  ok: boolean;
  failures: string[];
}

export const DEFAULT_OPS_THRESHOLDS: OpsThresholds = {
  maxQueuedJobs: 50,
  maxEvidenceBytes: 1024 * 1024 * 1024,
};

/** MB shorthand for the `OPS_MAX_EVIDENCE_MB` env override. */
export function evidenceBytesFromMb(mb: number): number {
  return mb * 1024 * 1024;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${bytes} B`;
}

/**
 * Fail-closed evaluation: every breached threshold is a failure so the
 * scheduled workflow alerts. Never throws on odd input — `NaN` signals fail
 * explicitly instead of passing silently.
 */
export function evaluateOpsStatus(
  signals: OpsSignals,
  thresholds: OpsThresholds = DEFAULT_OPS_THRESHOLDS,
): OpsEvaluation {
  const failures: string[] = [];

  if (!Number.isSafeInteger(signals.queuedJobs) || signals.queuedJobs < 0) {
    failures.push(`queuedJobs is not a usable count: ${signals.queuedJobs}.`);
  } else if (signals.queuedJobs > thresholds.maxQueuedJobs) {
    failures.push(
      `queuedJobs ${signals.queuedJobs} exceeds max ${thresholds.maxQueuedJobs} — ` +
        "the dispatch/schedule drain stopped keeping up.",
    );
  }

  if (
    !Number.isSafeInteger(signals.evidenceBytes) ||
    signals.evidenceBytes < 0
  ) {
    failures.push(
      `evidenceBytes is not a usable count: ${signals.evidenceBytes}.`,
    );
  } else if (signals.evidenceBytes > thresholds.maxEvidenceBytes) {
    failures.push(
      `evidence size ${formatBytes(signals.evidenceBytes)} ` +
        `(${signals.evidenceRowsEstimate} rows est.) exceeds max ` +
        `${formatBytes(thresholds.maxEvidenceBytes)} — ` +
        "review retention (docs/vercel.md §6) before the table degrades the database.",
    );
  }

  return { ok: failures.length === 0, failures };
}
